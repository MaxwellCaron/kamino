package authorization

type Mask int64

const (
	View Mask = 1 << iota
	CreateVM
	CreateFolder
	RenameVM
	RenameFolder
	DeleteVM
	DeleteFolder
	MoveVM
	MoveFolder
	PowerVM
	ConsoleVM
	CloneVM
	SnapshotVM
	TemplateVM
	ManagePermissions
)

const FullAccessMask = View |
	CreateVM |
	CreateFolder |
	RenameVM |
	RenameFolder |
	DeleteVM |
	DeleteFolder |
	MoveVM |
	MoveFolder |
	PowerVM |
	ConsoleVM |
	CloneVM |
	SnapshotVM |
	TemplateVM |
	ManagePermissions

type EffectivePermissions struct {
	AllowedMask Mask `json:"allowed_mask"`
	DeniedMask  Mask `json:"denied_mask"`
}

func (p EffectivePermissions) Has(required Mask) bool {
	return (p.AllowedMask & required) == required
}
