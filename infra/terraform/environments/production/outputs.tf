# After terraform apply, copy these ARNs into GitHub Secrets and K8s manifests.

output "github_actions_role_arn" {
  description = "Set as AWS_DEPLOY_ROLE_ARN in GitHub → Settings → Environments → production"
  value       = aws_iam_role.github_actions.arn
}

output "acm_certificate_arn" {
  description = "Paste into the 3 ingress-patch.yaml files and argocd/values.yaml"
  value       = aws_acm_certificate_validation.main.certificate_arn
}

output "route53_nameservers" {
  description = "Set these 4 NS records at your domain registrar"
  value       = aws_route53_zone.main.name_servers
}

output "route53_zone_id" {
  value = aws_route53_zone.main.zone_id
}

output "aws_lb_controller_role_arn" {
  description = "Paste into k8s/argocd/apps/aws-load-balancer-controller.yaml"
  value       = module.aws_load_balancer_controller_irsa.iam_role_arn
}

output "external_secrets_role_arn" {
  description = "Paste into k8s/argocd/apps/external-secrets.yaml"
  value       = module.external_secrets_irsa.iam_role_arn
}

output "external_dns_role_arn" {
  description = "Paste into k8s/argocd/apps/external-dns.yaml"
  value       = module.external_dns_irsa.iam_role_arn
}

output "oae_server_role_arn" {
  description = "Paste into k8s/manifests/server/overlays/production/serviceaccount-patch.yaml"
  value       = module.oae_server_irsa.iam_role_arn
}

output "redis_endpoint" {
  description = "Redis primary endpoint (added to AWS Secrets Manager automatically)"
  value       = module.elasticache.primary_endpoint
}
