variable "cluster_name" {
  description = "EKS cluster name"
  type        = string
}

variable "cluster_version" {
  description = "Kubernetes version"
  type        = string
  default     = "1.31"
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "intra_subnet_ids" {
  type = list(string)
}

variable "node_instance_types" {
  type    = list(string)
  default = ["t3.medium"]
}

variable "node_min_size" {
  type    = number
  default = 1
}

variable "node_max_size" {
  type    = number
  default = 5
}

variable "node_desired_size" {
  type    = number
  default = 2
}

variable "aws_region" {
  type = string
}

variable "secrets_prefix" {
  description = "Prefix for Secrets Manager secrets the ESO role can access"
  type        = string
  default     = "oae"
}

variable "s3_bucket_name" {
  description = "S3 bucket name the server IRSA role can access"
  type        = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
