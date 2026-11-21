resource "aws_dynamodb_table" "items" {
  name         = "${var.project_name}-items"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "itemId"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "itemId"
    type = "S"
  }

  server_side_encryption {
    enabled = true
  }
}

resource "aws_dynamodb_table" "users" {
  name         = "${var.project_name}-users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

  attribute {
    name = "userId"
    type = "S"
  }

  server_side_encryption {
    enabled = true
  }
}

# Apartment planner: designs with their likes and comments in one table.
#   pk = D#<designId>, sk = META | L#<userId> | C#<commentId>
# gsi1 lists every design (newest first) without reading the plans themselves.
resource "aws_dynamodb_table" "planner" {
  name         = "${var.project_name}-planner"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "gsi1pk"
    type = "S"
  }

  attribute {
    name = "gsi1sk"
    type = "S"
  }

  global_secondary_index {
    name            = "gsi1"
    hash_key        = "gsi1pk"
    range_key       = "gsi1sk"
    projection_type = "INCLUDE"
    non_key_attributes = [
      "designId",
      "title",
      "ownerId",
      "ownerName",
      "createdAt",
      "updatedAt",
      "likeCount",
      "commentCount",
      "thumb",
      "basedOn",
    ]
  }

  server_side_encryption {
    enabled = true
  }
}
