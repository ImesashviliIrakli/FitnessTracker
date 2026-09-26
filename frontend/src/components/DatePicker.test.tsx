import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DatePicker } from "./DatePicker";
import { Field } from "./ui";

function Harness({ initial = "2026-03-15", onChange = () => {}, ...props }: { initial?: string; onChange?: (v: string) => void; min?: string; max?: string; required?: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <Field label="Date">
      <DatePicker
        {...props}
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
      />
    </Field>
  );
}

const open = async () => {
  await userEvent.click(screen.getByRole("button", { name: /^Date/ }));
  return screen.getByRole("grid");
};
const day = (label: RegExp) => screen.getByRole("button", { name: label });

describe("DatePicker", () => {
  it("is named by its label and value, and opens on the selected month", async () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: /^Date .*15.*2026/ })).toBeInTheDocument();

    await open();
    expect((screen.getByLabelText("Month") as HTMLSelectElement).value).toBe("2");
    expect(day(/March 15, 2026|15 March 2026/).closest("td")).toHaveAttribute("aria-selected", "true");
    expect(day(/March 15, 2026|15 March 2026/)).toHaveFocus();
  });

  it("picks a clicked day and closes", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await open();
    await userEvent.click(day(/March 20, 2026|20 March 2026/));

    expect(onChange).toHaveBeenCalledWith("2026-03-20");
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("moves with the keyboard across months and selects with Enter", async () => {
    const onChange = vi.fn();
    render(<Harness initial="2026-03-31" onChange={onChange} />);
    await open();
    await userEvent.keyboard("{ArrowRight}{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith("2026-04-08");
  });

  it("respects max: later days and Today are disabled, keyboard clamps", async () => {
    const onChange = vi.fn();
    render(<Harness max="2026-03-16" onChange={onChange} />);
    await open();

    expect(day(/March 17, 2026|17 March 2026/)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Today" })).toBeDisabled();

    await userEvent.keyboard("{PageDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("2026-03-16");
  });

  it("offers Clear only when not required", async () => {
    const onChange = vi.fn();
    const { unmount } = render(<Harness onChange={onChange} />);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenCalledWith("");
    unmount();

    render(<Harness required />);
    await open();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });
});
