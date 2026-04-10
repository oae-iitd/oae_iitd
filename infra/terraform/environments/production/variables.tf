variable "aws_region" {
  type    = string
  default = "ap-south-1"
}

variable "environment" {
  type    = string
  default = "production"
}

variable "project" {
  type    = string
  default = "oae"
}

# --- ElastiCache ---
variable "redis_node_type" {
  type    = string
  default = "cache.t3.small"
}

variable "redis_num_clusters" {
  type    = number
  default = 2
}

variable "redis_auth_token" {
  type      = string
  sensitive = true
}

# --- S3 ---
variable "s3_bucket_name" {
  type    = string
  default = "oae-iitd-files-957905179934"
}

# --- Domain ---
variable "domain" {
  type    = string
  default = "anyserver.site"
}

# --- GitHub OIDC ---
variable "github_org" {
  type    = string
  default = "oae-iitd"
}

variable "github_repo" {
  type    = string
  default = "oae_iitd"
}
