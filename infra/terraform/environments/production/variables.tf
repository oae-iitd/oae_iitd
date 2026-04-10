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

# --- VPC ---
variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

# --- EKS ---
variable "eks_cluster_version" {
  type    = string
  default = "1.31"
}

variable "node_instance_types" {
  type    = list(string)
  default = ["t3.medium"]
}

variable "node_min_size" {
  type    = number
  default = 2
}

variable "node_max_size" {
  type    = number
  default = 5
}

variable "node_desired_size" {
  type    = number
  default = 2
}

# --- RDS ---
variable "db_name" {
  type    = string
  default = "oae"
}

variable "db_username" {
  type    = string
  default = "oaeuser"
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "rds_instance_class" {
  type    = string
  default = "db.t3.small"
}

variable "rds_multi_az" {
  type    = bool
  default = true
}

# --- ElastiCache ---
variable "redis_node_type" {
  type    = string
  default = "cache.t3.small"
}

variable "redis_num_clusters" {
  type    = number
  default = 2  # primary + replica
}

variable "redis_auth_token" {
  type      = string
  sensitive = true
}

# --- S3 ---
variable "s3_bucket_name" {
  type = string
}

# --- Domain ---
variable "domain" {
  type        = string
  description = "Root domain (e.g. anyserver.site). ACM will cover *.domain too."
}

# --- GitHub ---
variable "github_org" {
  type        = string
  description = "GitHub org or username (e.g. myorg)"
}

variable "github_repo" {
  type        = string
  description = "GitHub repo name (e.g. odi_server)"
}
