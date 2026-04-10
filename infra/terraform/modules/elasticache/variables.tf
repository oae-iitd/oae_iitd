variable "name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "allowed_security_group_ids" {
  type    = list(string)
  default = []
}

variable "allowed_cidr_blocks" {
  type    = list(string)
  default = []
}

variable "node_type" {
  type    = string
  default = "cache.t3.micro"
}

variable "num_cache_clusters" {
  type    = number
  default = 1
}

variable "engine_version" {
  type    = string
  default = "7.1"
}

variable "auth_token" {
  type      = string
  sensitive = true
}

variable "secrets_prefix" {
  type    = string
  default = "oae/production"
}

variable "tags" {
  type    = map(string)
  default = {}
}
