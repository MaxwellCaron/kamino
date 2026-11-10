package pods

func testCloneTarget() podCloneTarget {
	return podCloneTarget{
		Key:              "default",
		Label:            "Default",
		LANVNet:          "pod",
		DMZVNet:          "dmz",
		WANBridge:        "vmbr0",
		WANSubnet:        "172.16.0.0/16",
		CloudInitStorage: "local",
		IsDefault:        true,
	}
}
