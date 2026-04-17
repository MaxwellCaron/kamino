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
	EditVMHardware
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
	ManagePermissions |
	EditVMHardware

type EffectivePermissions struct {
	AllowedMask Mask `json:"allowed_mask"`
	DeniedMask  Mask `json:"denied_mask"`
}

func (p EffectivePermissions) Has(required Mask) bool {
	return (p.AllowedMask & required) == required
}

type ManagementMask int64

const (
	ViewSDN ManagementMask = 1 << iota
	ManageSDN
	ViewPrincipals
	ManagePrincipals
	ManageAccess
)

const FullManagementAccessMask = ViewSDN |
	ManageSDN |
	ViewPrincipals |
	ManagePrincipals |
	ManageAccess

type EffectiveManagementPermissions struct {
	AllowedMask ManagementMask `json:"allowed_mask"`
	DeniedMask  ManagementMask `json:"denied_mask"`
}

func (p EffectiveManagementPermissions) Has(required ManagementMask) bool {
	return (p.AllowedMask & required) == required
}
