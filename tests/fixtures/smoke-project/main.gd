extends Node2D

@onready var status: Label = $Label

func _ready() -> void:
	status.text = "min.gd smoke test passed"
