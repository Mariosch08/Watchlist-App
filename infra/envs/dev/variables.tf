variable "region" {
  type    = string
  default = "eu-central-1"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "cors_origins" {
  description = "Allowed frontend origins (Vite dev server + deployed frontend)."
  type        = list(string)
  default     = ["http://localhost:5173"]
}
