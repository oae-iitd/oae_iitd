variable "repositories" {
  description = "List of ECR repository names to create"
  type        = list(string)
}

variable "tags" {
  type    = map(string)
  default = {}
}
