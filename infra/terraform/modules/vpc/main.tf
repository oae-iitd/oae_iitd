locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
}

data "aws_availability_zones" "available" {
  state = "available"
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${var.name}-vpc"
  cidr = var.cidr

  azs             = local.azs
  private_subnets = [for k, v in local.azs : cidrsubnet(var.cidr, 4, k)]
  public_subnets  = [for k, v in local.azs : cidrsubnet(var.cidr, 4, k + 4)]
  intra_subnets   = [for k, v in local.azs : cidrsubnet(var.cidr, 4, k + 8)]

  enable_nat_gateway     = true
  single_nat_gateway     = var.single_nat_gateway
  enable_dns_hostnames   = true
  enable_dns_support     = true

  # EKS requires these tags on subnets
  public_subnet_tags = {
    "kubernetes.io/role/elb"                    = 1
    "kubernetes.io/cluster/${var.cluster_name}"  = "shared"
  }

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb"            = 1
    "kubernetes.io/cluster/${var.cluster_name}"  = "shared"
  }

  tags = var.tags
}
