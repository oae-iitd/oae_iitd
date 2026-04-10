locals {
  cluster_name   = "oae-production"
  secrets_prefix = "${var.project}/${var.environment}"

  common_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# ── Existing resources (data sources) ──────────────────────────────────────────
data "aws_caller_identity" "current" {}

data "aws_vpc" "main" {
  id = "vpc-00bf4538e85d96033"
}

data "aws_subnets" "private" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.main.id]
  }
  filter {
    name   = "tag:Name"
    values = ["*private*"]
  }
}

data "aws_eks_cluster" "main" {
  name = local.cluster_name
}

data "aws_s3_bucket" "uploads" {
  bucket = var.s3_bucket_name
}

# ── EKS OIDC Provider (enables IRSA — IAM Roles for Service Accounts) ──────────
# Required for pods to assume IAM roles without storing credentials.
data "tls_certificate" "eks" {
  url = data.aws_eks_cluster.main.identity[0].oidc[0].issuer
}

resource "aws_iam_openid_connect_provider" "eks" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.eks.certificates[0].sha1_fingerprint]
  url             = data.aws_eks_cluster.main.identity[0].oidc[0].issuer
  tags            = local.common_tags
}

# ── ElastiCache (Redis) ─────────────────────────────────────────────────────────
module "elasticache" {
  source = "../../modules/elasticache"

  name                = local.cluster_name
  vpc_id              = data.aws_vpc.main.id
  subnet_ids          = data.aws_subnets.private.ids
  allowed_cidr_blocks = [data.aws_vpc.main.cidr_block]
  node_type           = var.redis_node_type
  num_cache_clusters  = var.redis_num_clusters
  auth_token          = var.redis_auth_token
  secrets_prefix      = local.secrets_prefix
  tags                = local.common_tags
}

# ── Route53 (DNS) ───────────────────────────────────────────────────────────────
resource "aws_route53_zone" "main" {
  name = var.domain
  tags = local.common_tags
}

# ── ACM Certificate (HTTPS) ─────────────────────────────────────────────────────
resource "aws_acm_certificate" "main" {
  domain_name               = var.domain
  subject_alternative_names = ["*.${var.domain}"]
  validation_method         = "DNS"
  tags                      = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}

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
# Lets GitHub Actions assume an AWS role without storing any AWS keys.
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]
  tags            = local.common_tags
}

resource "aws_iam_role" "github_actions" {
  name                 = "${local.cluster_name}-github-actions"
  max_session_duration = 7200

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

# AdministratorAccess is safe here: the OIDC trust policy above locks this role
# to only the oae-iitd/oae_iitd GitHub repo. No other principal can assume it.
# This allows GitHub Actions to run Terraform (broad infra changes) AND push to ECR.
resource "aws_iam_role_policy_attachment" "github_actions_admin" {
  role       = aws_iam_role.github_actions.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# ── IRSA: AWS Load Balancer Controller ─────────────────────────────────────────
module "aws_load_balancer_controller_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name                              = "${local.cluster_name}-aws-lb-controller"
  attach_load_balancer_controller_policy = true

  oidc_providers = {
    ex = {
      provider_arn               = aws_iam_openid_connect_provider.eks.arn
      namespace_service_accounts = ["kube-system:aws-load-balancer-controller"]
    }
  }

  tags = local.common_tags
}

# ── IRSA: External Secrets Operator ────────────────────────────────────────────
module "external_secrets_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name                             = "${local.cluster_name}-external-secrets"
  attach_external_secrets_policy        = true
  external_secrets_secrets_manager_arns = ["arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${local.secrets_prefix}/*"]

  oidc_providers = {
    ex = {
      provider_arn               = aws_iam_openid_connect_provider.eks.arn
      namespace_service_accounts = ["external-secrets:external-secrets-sa"]
    }
  }

  tags = local.common_tags
}

# ── IRSA: External DNS ──────────────────────────────────────────────────────────
module "external_dns_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name                     = "${local.cluster_name}-external-dns"
  attach_external_dns_policy    = true
  external_dns_hosted_zone_arns = [aws_route53_zone.main.arn]

  oidc_providers = {
    ex = {
      provider_arn               = aws_iam_openid_connect_provider.eks.arn
      namespace_service_accounts = ["external-dns:external-dns"]
    }
  }

  tags = local.common_tags
}

# ── IRSA: OAE Server (S3 access) ────────────────────────────────────────────────
module "oae_server_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name = "${local.cluster_name}-oae-server"

  oidc_providers = {
    ex = {
      provider_arn               = aws_iam_openid_connect_provider.eks.arn
      namespace_service_accounts = ["oae:oae-server"]
    }
  }

  tags = local.common_tags
}

resource "aws_iam_role_policy" "oae_server_s3" {
  name = "${local.cluster_name}-oae-server-s3"
  role = module.oae_server_irsa.iam_role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
      ]
      Resource = [
        "arn:aws:s3:::${var.s3_bucket_name}",
        "arn:aws:s3:::${var.s3_bucket_name}/*",
      ]
    }]
  })
}
