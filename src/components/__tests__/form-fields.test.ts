// src/components/__tests__/form-fields.test.ts
import { describe, it, expect } from "vitest"
import { fieldStyle, pickerStyle, saveButton } from "@/components/form-fields"
import { choiceChipStyle } from "@/components/choice"

describe("shared form styles", () => {
  it("keeps the 16px field that stops iOS zooming", () => {
    expect(fieldStyle.fontSize).toBe("1rem")
  })
  it("strips native picker appearance for iOS width", () => {
    expect(pickerStyle.appearance).toBe("none")
    expect(pickerStyle.WebkitAppearance).toBe("none")
  })
  it("fills Save with the action colour", () => {
    expect(saveButton.backgroundColor).toBe("var(--action)")
  })
  it("chip: a picked chip gets the self fill, a quiet unpicked one goes secondary", () => {
    expect(choiceChipStyle(true, true, false).backgroundColor).toBe("var(--surface-self)")
    expect(choiceChipStyle(false, true, false).color).toBe("var(--text-secondary)")
    expect(choiceChipStyle(false, false, true).cursor).toBe("default")
  })
})
