output "certificate_arn" {
  value       = aws_acm_certificate_validation.cert.certificate_arn
  description = "Validated ACM certificate ARN (us-east-1) for use with CloudFront."
}

output "zone_id" {
  value = aws_route53_zone.main.zone_id
}

output "name_servers" {
  value       = aws_route53_zone.main.name_servers
  description = "Delegate these NS records at your domain registrar."
}
