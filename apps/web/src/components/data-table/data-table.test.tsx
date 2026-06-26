import { describe, expect, it, vi } from "vitest"
import { act, fireEvent, screen } from "@testing-library/react"
import { DataTable } from "./data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { renderWithQueryClient } from "@/test/test-utils"

vi.mock("@/components/loading-transition", () => ({
  loadingTransition: {},
}))

type Row = { id: string; name: string }

const columns: Array<ColumnDef<Row>> = [
  {
    accessorKey: "name",
    header: "Name",
  },
]

function makeRows(count: number): Array<Row> {
  return Array.from({ length: count }, (_value, index) => ({
    id: `row-${index}`,
    name: `Row ${index}`,
  }))
}

describe("DataTable client mode", () => {
  it("paginates local data with initialPageSize=25 by default", () => {
    renderWithQueryClient(
      <DataTable columns={columns} data={makeRows(60)} error={null} />
    )

    // 25 rows fit on the first page, plus the header row.
    expect(screen.getByText("Row 0")).toBeInTheDocument()
    expect(screen.getByText("Row 24")).toBeInTheDocument()
    expect(screen.queryByText("Row 25")).not.toBeInTheDocument()
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument()
  })

  it("filters local rows via the search input", () => {
    renderWithQueryClient(
      <DataTable columns={columns} data={makeRows(5)} error={null} />
    )

    const search = screen.getByPlaceholderText("Search...")
    fireEvent.change(search, { target: { value: "Row 3" } })

    expect(screen.getByText("Row 3")).toBeInTheDocument()
    expect(screen.queryByText("Row 0")).not.toBeInTheDocument()
  })
})

describe("DataTable server mode", () => {
  it("renders only the current API page rows passed in data", () => {
    const onPaginationChange = vi.fn()
    const onSearchChange = vi.fn()

    renderWithQueryClient(
      <DataTable
        columns={columns}
        data={makeRows(10)}
        error={null}
        serverPagination={{
          mode: "server",
          pagination: { pageIndex: 0, pageSize: 25 },
          onPaginationChange,
          rowCount: 100,
          search: "",
          onSearchChange,
        }}
      />
    )

    expect(screen.getByText("Row 0")).toBeInTheDocument()
    expect(screen.getByText("Row 9")).toBeInTheDocument()
    // rowCount drives page count, not the length of the local data array.
    expect(screen.getByText(/Page 1 of 4/)).toBeInTheDocument()
  })

  it("calls onPaginationChange with pageIndex + 1 when clicking next", () => {
    const onPaginationChange = vi.fn()
    const onSearchChange = vi.fn()

    renderWithQueryClient(
      <DataTable
        columns={columns}
        data={makeRows(25)}
        error={null}
        serverPagination={{
          mode: "server",
          pagination: { pageIndex: 0, pageSize: 25 },
          onPaginationChange,
          rowCount: 100,
          search: "",
          onSearchChange,
        }}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Go to next page" }))

    expect(onPaginationChange).toHaveBeenCalledTimes(1)
    const updater = onPaginationChange.mock.calls[0][0]
    const next =
      typeof updater === "function"
        ? updater({ pageIndex: 0, pageSize: 25 })
        : updater
    expect(next).toEqual({ pageIndex: 1, pageSize: 25 })
  })

  it("calls onPaginationChange with the selected row count and pageIndex 0 when rows per page changes", async () => {
    const onPaginationChange = vi.fn()
    const onSearchChange = vi.fn()

    renderWithQueryClient(
      <DataTable
        columns={columns}
        data={makeRows(25)}
        error={null}
        serverPagination={{
          mode: "server",
          pagination: { pageIndex: 2, pageSize: 25 },
          onPaginationChange,
          rowCount: 100,
          search: "",
          onSearchChange,
        }}
      />
    )

    const trigger = screen.getByRole("combobox")
    trigger.focus()
    await act(async () => {
      fireEvent.keyDown(trigger, { key: "ArrowDown" })
    })

    // Options render as 10, 20, 25 (selected), 30, 40, 50 - three more
    // ArrowDown presses from the selected "25" option highlights "50".
    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        fireEvent.keyDown(document.activeElement ?? trigger, {
          key: "ArrowDown",
        })
      })
    }

    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? trigger, { key: "Enter" })
    })

    expect(onPaginationChange).toHaveBeenCalledTimes(1)
    const updater = onPaginationChange.mock.calls[0][0]
    const next =
      typeof updater === "function"
        ? updater({ pageIndex: 2, pageSize: 25 })
        : updater
    expect(next).toEqual({ pageIndex: 0, pageSize: 50 })
  })

  it("calls onSearchChange and resets pageIndex to 0 when typing search", () => {
    const onPaginationChange = vi.fn()
    const onSearchChange = vi.fn()

    renderWithQueryClient(
      <DataTable
        columns={columns}
        data={makeRows(10)}
        error={null}
        serverPagination={{
          mode: "server",
          pagination: { pageIndex: 3, pageSize: 25 },
          onPaginationChange,
          rowCount: 100,
          search: "",
          onSearchChange,
        }}
      />
    )

    const search = screen.getByPlaceholderText("Search...")
    fireEvent.change(search, { target: { value: "vm-100" } })

    expect(onSearchChange).toHaveBeenCalledWith("vm-100")
    expect(onPaginationChange).toHaveBeenCalledTimes(1)
    const updater = onPaginationChange.mock.calls[0][0]
    const next =
      typeof updater === "function"
        ? updater({ pageIndex: 3, pageSize: 25 })
        : updater
    expect(next).toEqual({ pageIndex: 0, pageSize: 25 })
  })

  it("does not require loading all rows into data", () => {
    const onPaginationChange = vi.fn()
    const onSearchChange = vi.fn()

    // Only the current page (2 rows) is passed in, while rowCount reports a
    // much larger filtered total — server mode must not need the full set.
    renderWithQueryClient(
      <DataTable
        columns={columns}
        data={makeRows(2)}
        error={null}
        serverPagination={{
          mode: "server",
          pagination: { pageIndex: 0, pageSize: 25 },
          onPaginationChange,
          rowCount: 1000,
          search: "",
          onSearchChange,
        }}
      />
    )

    expect(screen.getByText("Row 0")).toBeInTheDocument()
    expect(screen.getByText("Row 1")).toBeInTheDocument()
    expect(screen.getByText(/Page 1 of 40/)).toBeInTheDocument()
  })
})
