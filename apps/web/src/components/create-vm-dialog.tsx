import { useEffect, useState } from "react"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { toast } from "sonner"
import { IconDeviceImac, IconPlus, IconTrash } from "@tabler/icons-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
} from "@workspace/ui/components/combobox"
import {
  bridgesQueryOptions,
  createVM,
  getNextVMID,
  inventoryTreeQueryOptions,
  isosQueryOptions,
  nodesQueryOptions,
  storagesQueryOptions,
} from "@/lib/queries"
import { vmNameSchema } from "@/lib/vm-name"

const networkInterfaceSchema = z.object({
  bridge: z.string().default("vmbr0"),
  model: z.string().default("virtio"),
  vlan_tag: z.number().int().optional(),
  firewall: z.boolean().default(true),
})

const vmSchema = z.object({
  node: z.string().min(1, "Node is required"),
  vmid: z.number().int().min(100, "VM ID must be at least 100"),
  name: vmNameSchema,
  pool: z.string().optional(),
  ostype: z.string().default("l26"),
  iso: z.string().optional(),
  bios: z.string().default("seabios"),
  machine: z.string().default("pc"),
  sockets: z.number().int().min(1).default(1),
  cores: z.number().int().min(1).default(1),
  cpu_type: z.string().default("x86-64-v2-AES"),
  numa: z.boolean().default(false),
  memory: z.number().int().min(16).default(2048),
  balloon: z.number().int().default(0),
  storage: z.string().optional(),
  disk_size: z.number().int().min(1).default(32),
  networks: z
    .array(networkInterfaceSchema)
    .default([{ bridge: "vmbr0", model: "virtio", firewall: true }]),
})

type VMFormValues = z.infer<typeof vmSchema>

const defaultValues: VMFormValues = {
  node: "",
  vmid: 0,
  name: "",
  pool: "",
  ostype: "l26",
  iso: "",
  bios: "seabios",
  machine: "pc",
  sockets: 1,
  cores: 1,
  cpu_type: "x86-64-v2-AES",
  numa: false,
  memory: 2048,
  balloon: 0,
  storage: "",
  disk_size: 32,
  networks: [{ bridge: "vmbr0", model: "virtio", firewall: true }],
}

export function CreateVmDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState("general")
  const [selectedNode, setSelectedNode] = useState("")
  const [isoStorage, setIsoStorage] = useState("")

  const { data: nodes } = useQuery(nodesQueryOptions)
  const { data: storages } = useQuery(storagesQueryOptions(selectedNode))
  const { data: isos } = useQuery(isosQueryOptions(selectedNode, isoStorage))
  const { data: networks } = useQuery(bridgesQueryOptions(selectedNode))

  const diskStorages =
    storages?.filter((s) => s.content.includes("images")) ?? []
  const isoStorages = storages?.filter((s) => s.content.includes("iso")) ?? []

  const mutation = useMutation({
    mutationFn: createVM,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: inventoryTreeQueryOptions.queryKey,
      })
      onOpenChange(false)
      form.reset()
      setTab("general")
    },
  })

  const form = useForm({
    defaultValues,
    onSubmit: ({ value }) => {
      const parsed = vmSchema.parse(value)
      toast.promise(mutation.mutateAsync(parsed), {
        loading: `Creating VM ${parsed.vmid}…`,
        success: `VM ${parsed.vmid} created`,
        error: (err: Error) => err.message,
      })
    },
  })

  useEffect(() => {
    if (open) {
      getNextVMID().then((id) => {
        form.setFieldValue("vmid", id)
      })
    } else {
      form.reset()
      setTab("general")
    }
  }, [open, form])

  const tabs = [
    "general",
    "os",
    "system",
    "disks",
    "cpu",
    "memory",
    "network",
    "confirm",
  ]
  const tabIndex = tabs.indexOf(tab)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl sm:max-w-2xl" initialFocus={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconDeviceImac className="size-5" />
            Create Virtual Machine
          </DialogTitle>
          <DialogDescription>
            Configure and create a new virtual machine.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
        >
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-6 w-full">
              {tabs.map((t) => (
                <TabsTrigger key={t} value={t} className="capitalize">
                  {t}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="general">
              <FieldGroup>
                <form.Field name="node">
                  {(field) => (
                    <Field>
                      <FieldLabel>Node</FieldLabel>
                      <Select
                        value={field.state.value}
                        onValueChange={(val) => {
                          if (!val) return
                          field.handleChange(val)
                          setSelectedNode(val)
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a node" />
                        </SelectTrigger>
                        <SelectContent>
                          {nodes?.map((n) => (
                            <SelectItem key={n.node} value={n.node}>
                              {n.node}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                </form.Field>
                <form.Field name="vmid">
                  {(field) => (
                    <Field>
                      <FieldLabel>VM ID</FieldLabel>
                      <Input
                        type="number"
                        value={field.state.value || ""}
                        onChange={(e) =>
                          field.handleChange(parseInt(e.target.value) || 0)
                        }
                      />
                    </Field>
                  )}
                </form.Field>
                <form.Field name="name">
                  {(field) => (
                    <Field>
                      <FieldLabel>Name</FieldLabel>
                      <Input
                        placeholder="my-vm"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                      <FieldError>{field.state.meta.errors[0]}</FieldError>
                    </Field>
                  )}
                </form.Field>
                <form.Field name="pool">
                  {(field) => (
                    <Field>
                      <FieldLabel>Resource Pool</FieldLabel>
                      <Input
                        placeholder="Optional"
                        value={field.state.value ?? ""}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                    </Field>
                  )}
                </form.Field>
              </FieldGroup>
            </TabsContent>

            <TabsContent value="os">
              <FieldGroup>
                <form.Field name="ostype">
                  {(field) => (
                    <Field>
                      <FieldLabel>Guest OS Type</FieldLabel>
                      <Select
                        value={field.state.value}
                        onValueChange={(v) => v && field.handleChange(v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="l26">Linux 2.6+</SelectItem>
                          <SelectItem value="l24">Linux 2.4</SelectItem>
                          <SelectItem value="win11">Windows 11/2022</SelectItem>
                          <SelectItem value="win10">
                            Windows 10/2016/2019
                          </SelectItem>
                          <SelectItem value="win8">Windows 8/2012</SelectItem>
                          <SelectItem value="win7">Windows 7/2008</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                </form.Field>
                {isoStorages.length > 0 && (
                  <Field>
                    <FieldLabel>ISO Storage</FieldLabel>
                    <Select
                      value={isoStorage}
                      onValueChange={(v) => v && setIsoStorage(v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select storage for ISOs" />
                      </SelectTrigger>
                      <SelectContent>
                        {isoStorages.map((s) => (
                          <SelectItem key={s.storage} value={s.storage}>
                            {s.storage}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                <form.Field name="iso">
                  {(field) => (
                    <Field>
                      <FieldLabel>ISO Image</FieldLabel>
                      <Select
                        value={field.state.value ?? ""}
                        onValueChange={(v) => v && field.handleChange(v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select an ISO" />
                        </SelectTrigger>
                        <SelectContent>
                          {isos?.map((iso) => (
                            <SelectItem key={iso.volid} value={iso.volid}>
                              {iso.volid}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                </form.Field>
              </FieldGroup>
            </TabsContent>

            <TabsContent value="system">
              <FieldGroup>
                <form.Field name="bios">
                  {(field) => (
                    <Field>
                      <FieldLabel>BIOS</FieldLabel>
                      <Select
                        value={field.state.value}
                        onValueChange={(v) => v && field.handleChange(v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="seabios">
                            SeaBIOS (Default)
                          </SelectItem>
                          <SelectItem value="ovmf">OVMF (UEFI)</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                </form.Field>
                <form.Field name="machine">
                  {(field) => (
                    <Field>
                      <FieldLabel>Machine Type</FieldLabel>
                      <Select
                        value={field.state.value}
                        onValueChange={(v) => v && field.handleChange(v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pc">i440fx (Default)</SelectItem>
                          <SelectItem value="q35">q35</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                </form.Field>
              </FieldGroup>
            </TabsContent>

            <TabsContent value="disks">
              <FieldGroup>
                <form.Field name="storage">
                  {(field) => (
                    <Field>
                      <FieldLabel>Storage</FieldLabel>
                      <Select
                        value={field.state.value ?? ""}
                        onValueChange={(v) => v && field.handleChange(v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select storage" />
                        </SelectTrigger>
                        <SelectContent>
                          {diskStorages.map((s) => (
                            <SelectItem key={s.storage} value={s.storage}>
                              {s.storage}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                </form.Field>
                <form.Field name="disk_size">
                  {(field) => (
                    <Field>
                      <FieldLabel>Disk Size (GB)</FieldLabel>
                      <Input
                        type="number"
                        value={field.state.value}
                        onChange={(e) =>
                          field.handleChange(parseInt(e.target.value) || 0)
                        }
                      />
                    </Field>
                  )}
                </form.Field>
              </FieldGroup>
            </TabsContent>

            <TabsContent value="cpu">
              <FieldGroup>
                <form.Field name="sockets">
                  {(field) => (
                    <Field>
                      <FieldLabel>Sockets</FieldLabel>
                      <Input
                        type="number"
                        min={1}
                        max={4}
                        value={field.state.value}
                        onChange={(e) =>
                          field.handleChange(parseInt(e.target.value) || 1)
                        }
                      />
                    </Field>
                  )}
                </form.Field>
                <form.Field name="cores">
                  {(field) => (
                    <Field>
                      <FieldLabel>Cores</FieldLabel>
                      <Input
                        type="number"
                        min={1}
                        value={field.state.value}
                        onChange={(e) =>
                          field.handleChange(parseInt(e.target.value) || 1)
                        }
                      />
                    </Field>
                  )}
                </form.Field>
                <form.Field name="cpu_type">
                  {(field) => (
                    <Field>
                      <FieldLabel>CPU Type</FieldLabel>
                      <Select
                        value={field.state.value}
                        onValueChange={(v) => v && field.handleChange(v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="x86-64-v2-AES">
                            x86-64-v2-AES (Default)
                          </SelectItem>
                          <SelectItem value="host">host</SelectItem>
                          <SelectItem value="kvm64">kvm64</SelectItem>
                          <SelectItem value="qemu64">qemu64</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                </form.Field>
                <form.Field name="numa">
                  {(field) => (
                    <Field orientation="horizontal">
                      <Checkbox
                        id="numa"
                        checked={field.state.value}
                        onCheckedChange={(checked) =>
                          field.handleChange(!!checked)
                        }
                      />
                      <FieldContent>
                        <FieldLabel htmlFor="numa">Enable NUMA</FieldLabel>
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>
              </FieldGroup>
            </TabsContent>

            <TabsContent value="memory">
              <FieldGroup>
                <form.Field name="memory">
                  {(field) => (
                    <Field>
                      <FieldLabel>Memory (MB)</FieldLabel>
                      <Input
                        type="number"
                        min={16}
                        step={256}
                        value={field.state.value}
                        onChange={(e) =>
                          field.handleChange(parseInt(e.target.value) || 512)
                        }
                      />
                    </Field>
                  )}
                </form.Field>
                <form.Field name="balloon">
                  {(field) => (
                    <Field>
                      <FieldLabel>Minimum Memory / Balloon (MB)</FieldLabel>
                      <FieldDescription>
                        Set to 0 to disable ballooning.
                      </FieldDescription>
                      <Input
                        type="number"
                        min={0}
                        step={256}
                        value={field.state.value}
                        onChange={(e) =>
                          field.handleChange(parseInt(e.target.value) || 0)
                        }
                      />
                    </Field>
                  )}
                </form.Field>
              </FieldGroup>
            </TabsContent>

            <TabsContent value="network">
              <form.Field name="networks" mode="array">
                {(networksField) => (
                  <div className="space-y-4">
                    {networksField.state.value.map((_, i) => (
                      <div key={i} className="space-y-3 rounded-lg border p-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">net{i}</p>
                          {networksField.state.value.length > 1 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => networksField.removeValue(i)}
                            >
                              <IconTrash className="size-4" />
                            </Button>
                          )}
                        </div>
                        <FieldGroup>
                          <form.Field name={`networks[${i}].bridge`}>
                            {(field) => (
                              <Field>
                                <FieldLabel>Bridge</FieldLabel>
                                <Combobox
                                  value={field.state.value}
                                  onValueChange={(val) =>
                                    field.handleChange(val as string)
                                  }
                                >
                                  <ComboboxInput
                                    placeholder="vmbr0"
                                    onChange={(e) =>
                                      field.handleChange(e.target.value)
                                    }
                                  />
                                  <ComboboxContent>
                                    <ComboboxList>
                                      <ComboboxGroup
                                        key="bridges"
                                        items={networks?.bridges}
                                      >
                                        <ComboboxLabel>Bridges</ComboboxLabel>
                                        {networks?.bridges.map((b) => (
                                          <ComboboxItem
                                            key={b.iface}
                                            value={b.iface}
                                          >
                                            {b.iface}
                                            {b.comments && (
                                              <span className="ml-1 text-xs text-muted-foreground">
                                                {b.comments}
                                              </span>
                                            )}
                                          </ComboboxItem>
                                        ))}
                                      </ComboboxGroup>
                                      <ComboboxSeparator />
                                      <ComboboxGroup
                                        key="vnets"
                                        items={networks?.vnets}
                                      >
                                        <ComboboxLabel>VNets</ComboboxLabel>
                                        {networks?.vnets.map((b) => (
                                          <ComboboxItem
                                            key={b.vnet}
                                            value={b.vnet}
                                          >
                                            {b.vnet}
                                            {b.alias && (
                                              <span className="ml-1 text-xs text-muted-foreground">
                                                {b.alias}
                                              </span>
                                            )}
                                          </ComboboxItem>
                                        ))}
                                      </ComboboxGroup>
                                      <ComboboxEmpty>
                                        {selectedNode
                                          ? "No bridges found"
                                          : "Select a node first"}
                                      </ComboboxEmpty>
                                    </ComboboxList>
                                  </ComboboxContent>
                                </Combobox>
                              </Field>
                            )}
                          </form.Field>
                          <form.Field name={`networks[${i}].model`}>
                            {(field) => (
                              <Field>
                                <FieldLabel>Model</FieldLabel>
                                <Select
                                  value={field.state.value}
                                  onValueChange={(v) =>
                                    v && field.handleChange(v)
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="virtio">
                                      VirtIO (Default)
                                    </SelectItem>
                                    <SelectItem value="e1000">
                                      Intel E1000
                                    </SelectItem>
                                    <SelectItem value="rtl8139">
                                      Realtek RTL8139
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </Field>
                            )}
                          </form.Field>
                          <form.Field name={`networks[${i}].vlan_tag`}>
                            {(field) => (
                              <Field>
                                <FieldLabel>VLAN Tag</FieldLabel>
                                <Input
                                  type="number"
                                  placeholder="No VLAN"
                                  value={field.state.value || ""}
                                  onChange={(e) =>
                                    field.handleChange(
                                      parseInt(e.target.value) || undefined
                                    )
                                  }
                                />
                              </Field>
                            )}
                          </form.Field>
                          <form.Field name={`networks[${i}].firewall`}>
                            {(field) => (
                              <Field orientation="horizontal">
                                <Checkbox
                                  id={`firewall-${i}`}
                                  checked={field.state.value}
                                  onCheckedChange={(checked) =>
                                    field.handleChange(!!checked)
                                  }
                                />
                                <FieldContent>
                                  <FieldLabel htmlFor={`firewall-${i}`}>
                                    Firewall
                                  </FieldLabel>
                                </FieldContent>
                              </Field>
                            )}
                          </form.Field>
                        </FieldGroup>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        networksField.pushValue({
                          bridge: "vmbr0",
                          model: "virtio",
                          firewall: true,
                        })
                      }
                    >
                      <IconPlus className="mr-1 size-4" />
                      Add Network Interface
                    </Button>
                  </div>
                )}
              </form.Field>
            </TabsContent>

            <TabsContent value="confirm">
              <form.Subscribe selector={(state) => state.values}>
                {(values) => (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <h3 className="mb-2 font-semibold">General</h3>
                      <dl className="space-y-1">
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Node</dt>
                          <dd>{values.node || "—"}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">VM ID</dt>
                          <dd>{values.vmid || "—"}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Name</dt>
                          <dd>{values.name || "—"}</dd>
                        </div>
                        {values.pool && (
                          <div className="flex justify-between">
                            <dt className="text-muted-foreground">Pool</dt>
                            <dd>{values.pool}</dd>
                          </div>
                        )}
                      </dl>
                    </div>
                    <div>
                      <h3 className="mb-2 font-semibold">OS</h3>
                      <dl className="space-y-1">
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Type</dt>
                          <dd>{values.ostype}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">ISO</dt>
                          <dd className="max-w-48 truncate">
                            {values.iso || "None"}
                          </dd>
                        </div>
                      </dl>
                    </div>
                    <div>
                      <h3 className="mb-2 font-semibold">Hardware</h3>
                      <dl className="space-y-1">
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">CPU</dt>
                          <dd>
                            {values.sockets}s / {values.cores}c
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Memory</dt>
                          <dd>{values.memory} MB</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Disk</dt>
                          <dd>
                            {values.disk_size} GB on {values.storage || "—"}
                          </dd>
                        </div>
                      </dl>
                    </div>
                    <div>
                      <h3 className="mb-2 font-semibold">Network</h3>
                      <dl className="space-y-2">
                        {values.networks.map((net, i) => (
                          <div key={i}>
                            <dt className="text-muted-foreground">net{i}</dt>
                            <dd className="ml-2 text-xs">
                              {net.model}, {net.bridge}
                              {net.vlan_tag ? `, VLAN ${net.vlan_tag}` : ""}
                              {net.firewall ? ", fw" : ""}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </div>
                )}
              </form.Subscribe>
            </TabsContent>
          </Tabs>

          <div className="mt-6 flex justify-between">
            <Button
              type="button"
              variant="outline"
              disabled={tabIndex === 0}
              onClick={() => setTab(tabs[tabIndex - 1])}
            >
              Previous
            </Button>
            {tab === "confirm" ? (
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Creating..." : "Create VM"}
                  </Button>
                )}
              </form.Subscribe>
            ) : (
              <Button type="button" onClick={() => setTab(tabs[tabIndex + 1])}>
                Next
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
