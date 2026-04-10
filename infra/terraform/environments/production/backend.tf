terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # Run infra/scripts/setup-backend.sh ONCE before terraform init
  backend "s3" {
    bucket         = "oae-tf-state-957905179934"
    key            = "production/terraform.tfstate"
    region         = "ap-south-1"
    encrypt        = true
    dynamodb_table = "oae-tf-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "oae"
      Environment = "production"
      ManagedBy   = "terraform"
    }
  }
}
