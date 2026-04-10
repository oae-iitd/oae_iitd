output "cluster_name" {
  value = module.eks.cluster_name
}

output "cluster_endpoint" {
  value     = module.eks.cluster_endpoint
  sensitive = true
}

# ECR image URLs — paste these into overlays/production/kustomization.yaml
output "ecr_server_url" {
  value = module.ecr.repository_urls["oae/server"]
}

output "ecr_admin_url" {
  value = module.ecr.repository_urls["oae/admin-client"]
}

output "ecr_register_url" {
  value = module.ecr.repository_urls["oae/register-client"]
}

output "rds_endpoint" {
  value = module.rds.endpoint
}

output "redis_endpoint" {
  value = module.elasticache.primary_endpoint
}

# IRSA role ARNs — paste these into K8s serviceaccount annotations + ArgoCD app values
output "odi_server_role_arn" {
  value = module.eks.odi_server_role_arn
}

output "external_secrets_role_arn" {
  value = module.eks.external_secrets_role_arn
}

output "aws_lb_controller_role_arn" {
  value = module.eks.aws_lb_controller_role_arn
}

output "external_dns_role_arn" {
  value = module.external_dns_irsa.iam_role_arn
}

# GitHub Actions — set this as AWS_DEPLOY_ROLE_ARN secret in GitHub
output "github_actions_role_arn" {
  value = aws_iam_role.github_actions.arn
}

# ACM — paste into ingress-patch.yaml certificate-arn annotation
output "acm_certificate_arn" {
  value = aws_acm_certificate_validation.main.certificate_arn
}

# Route53 — after apply, set these NS records at your domain registrar
output "route53_zone_id" {
  value = aws_route53_zone.main.zone_id
}

output "route53_nameservers" {
  value       = aws_route53_zone.main.name_servers
  description = "Set these 4 NS records at your domain registrar (Namecheap, GoDaddy, etc)"
}

output "kubeconfig_command" {
  value = "aws eks update-kubeconfig --region ${var.aws_region} --name ${module.eks.cluster_name}"
}
