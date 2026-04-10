locals {
  cluster_name    = "${var.project}-${var.environment}"
  secrets_prefix  = "${var.project}/${var.environment}"

  common_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# ── VPC ────────────────────────────────────────────────────────────────────────
module "vpc" {
  source = "../../modules/vpc"

  name               = local.cluster_name
  cidr               = var.vpc_cidr
  cluster_name       = local.cluster_name
  single_nat_gateway = false
  tags               = local.common_tags
}

# ── EKS ────────────────────────────────────────────────────────────────────────
module "eks" {
  source = "../../modules/eks"

  cluster_name        = local.cluster_name
  cluster_version     = var.eks_cluster_version
  vpc_id              = module.vpc.vpc_id
  private_subnet_ids  = module.vpc.private_subnet_ids
  intra_subnet_ids    = module.vpc.intra_subnet_ids
  node_instance_types = var.node_instance_types
  node_min_size       = var.node_min_size
  node_max_size       = var.node_max_size
  node_desired_size   = var.node_desired_size
  aws_region          = var.aws_region
  secrets_prefix      = local.secrets_prefix
  s3_bucket_name      = var.s3_bucket_name
  tags                = local.common_tags
}

# ── RDS (PostgreSQL) ────────────────────────────────────────────────────────────
module "rds" {
  source = "../../modules/rds"

  name                       = local.cluster_name
  vpc_id                     = module.vpc.vpc_id
  subnet_ids                 = module.vpc.private_subnet_ids
  allowed_cidr_blocks        = [module.vpc.vpc_cidr_block]
  db_name                    = var.db_name
  db_username                = var.db_username
  db_password                = var.db_password
  instance_class             = var.rds_instance_class
  multi_az                   = var.rds_multi_az
  skip_final_snapshot        = false
  deletion_protection        = true
  backup_retention_period    = 7
  secrets_prefix             = local.secrets_prefix
  tags                       = local.common_tags
}

# ── ElastiCache (Redis) ─────────────────────────────────────────────────────────
module "elasticache" {
  source = "../../modules/elasticache"

  name                       = local.cluster_name
  vpc_id                     = module.vpc.vpc_id
  subnet_ids                 = module.vpc.private_subnet_ids
  allowed_cidr_blocks        = [module.vpc.vpc_cidr_block]
  node_type                  = var.redis_node_type
  num_cache_clusters         = var.redis_num_clusters
  auth_token                 = var.redis_auth_token
  secrets_prefix             = local.secrets_prefix
  tags                       = local.common_tags
}

# ── ECR ────────────────────────────────────────────────────────────────────────
module "ecr" {
  source = "../../modules/ecr"

  repositories = ["oae/server", "oae/admin-client", "oae/register-client"]
  tags         = local.common_tags
}

# ── Route53 (DNS) ───────────────────────────────────────────────────────────────
resource "aws_route53_zone" "main" {
  name = var.domain
  tags = local.common_tags
}

# ── ACM Certificate (HTTPS) ─────────────────────────────────────────────────────
# Covers anyserver.site AND *.anyserver.site (all subdomains)
resource "aws_acm_certificate" "main" {
  domain_name               = var.domain
  subject_alternative_names = ["*.${var.domain}"]
  validation_method         = "DNS"
  tags                      = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}

# DNS records that prove to ACM you own the domain
resource "aws_route53_record" "acm_validation" {
  for_each = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = aws_route53_zone.main.zone_id
}

resource "aws_acm_certificate_validation" "main" {
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for r in aws_route53_record.acm_validation : r.fqdn]
}

# ── GitHub Actions OIDC ─────────────────────────────────────────────────────────
# Allows GitHub Actions to push images to ECR without storing AWS keys as secrets.
# Instead, GitHub gets a short-lived token via OIDC.
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]
}

resource "aws_iam_role" "github_actions" {
  name = "${local.cluster_name}-github-actions"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.github.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringLike = {
          # Only your repo can assume this role
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_org}/${var.github_repo}:*"
        }
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "github_actions_ecr" {
  name = "${local.cluster_name}-github-actions-ecr"
  role = aws_iam_role.github_actions.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Get auth token (account-level, no specific resource)
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        # Push/pull to all oae/* repos
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
        ]
        Resource = "arn:aws:ecr:${var.aws_region}:${data.aws_caller_identity.current.account_id}:repository/oae/*"
      }
    ]
  })
}

data "aws_caller_identity" "current" {}

# ── External-DNS IRSA ───────────────────────────────────────────────────────────
# external-dns runs in K8s and automatically creates Route53 records
# whenever an Ingress with a hostname annotation is created.
module "external_dns_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name                     = "${local.cluster_name}-external-dns"
  attach_external_dns_policy    = true
  external_dns_hosted_zone_arns = [aws_route53_zone.main.arn]

  oidc_providers = {
    ex = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["external-dns:external-dns"]
    }
  }

  tags = local.common_tags
}

# ── S3 bucket (uploads) ─────────────────────────────────────────────────────────
resource "aws_s3_bucket" "uploads" {
  bucket = var.s3_bucket_name
  tags   = local.common_tags
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket                  = aws_s3_bucket.uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── Terraform state backend resources (bootstrap once) ─────────────────────────
# Uncomment to create these on first run, then move to backend.tf
# resource "aws_s3_bucket" "tf_state" {
#   bucket = "oae-terraform-state"
# }
# resource "aws_dynamodb_table" "tf_locks" {
#   name         = "oae-terraform-locks"
#   billing_mode = "PAY_PER_REQUEST"
#   hash_key     = "LockID"
#   attribute {
#     name = "LockID"
#     type = "S"
#   }
# }
