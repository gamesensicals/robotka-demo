"use client";

import { useMemo, useRef, useState } from "react";
import { matches } from "@/lib/search";

export type SearchOption = { value: string; label: string; hint?: string };

/**
 * Výber s vyhľadávaním (ako položky z cenníka vo faktúre): píšeš a zoznam sa zužuje,
 * šípky + Enter alebo klik vyberie. Do formulára ide skrytá hodnota `name`.
 * `emptyLabel` = prvá voľba bez hodnoty (napr. „bez zákazníka“, „všetky firmy“).
 */
export default function SearchSelect({
  name, options, defaultValue = "", placeholder, required, emptyLabel, ariaLabel, noMatch, id,
}: {
  name: string;
  options: SearchOption[];
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  emptyLabel?: string;
  ariaLabel?: string;
  noMatch: string;
  id?: string;
}) {
  const all = useMemo(() => (emptyLabel ? [{ value: "", label: emptyLabel }, ...options] : options), [options, emptyLabel]);
  const labelOf = (v: string) => (v ? options.find((o) => o.value === v)?.label ?? "" : "");
  const [value, setValue] = useState(defaultValue);
  const [query, setQuery] = useState(labelOf(defaultValue));
  const [typed, setTyped] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  // kým nič nepíše, ukáž všetko; inak len to, čo sedí (bez diakritiky)
  const list = (typed ? all.filter((o) => o.value === "" ? !query.trim() : matches(query, o.label, o.hint)) : all).slice(0, 60);

  const choose = (o: SearchOption) => {
    setValue(o.value);
    setQuery(o.value ? o.label : "");
    setTyped(false);
    setOpen(false);
    input.current?.setCustomValidity("");
  };

  return (
    <div className="combo search-select">
      <input type="hidden" name={name} value={value} />
      <input
        ref={input}
        id={id}
        type="search"
        value={query}
        placeholder={value === "" && emptyLabel ? emptyLabel : placeholder}
        aria-label={ariaLabel}
        aria-expanded={open}
        role="combobox"
        autoComplete="off"
        required={required}
        onFocus={(e) => { setOpen(true); setActive(0); e.currentTarget.select(); }}
        onBlur={() => setTimeout(() => {
          setOpen(false);
          setTyped(false);
          // rozpísané, ale nevybraté: vráť vybranú hodnotu (alebo nič)
          setQuery(labelOf(value));
        }, 150)}
        onChange={(e) => {
          setQuery(e.target.value);
          setTyped(true);
          setOpen(true);
          setActive(0);
          if (!e.target.value.trim()) setValue("");
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, list.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && open && list[active]) { e.preventDefault(); choose(list[active]); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && list.length > 0 && (
        <ul className="combo-list" role="listbox">
          {list.map((o, n) => (
            <li
              key={o.value || "__empty"}
              role="option"
              aria-selected={o.value === value}
              className={`${n === active ? "on" : ""}${o.value === value ? " picked" : ""}`.trim() || undefined}
              onMouseDown={(e) => { e.preventDefault(); choose(o); }}
            >
              <span>{o.label}</span>
              {o.hint && <small>{o.hint}</small>}
            </li>
          ))}
        </ul>
      )}
      {open && typed && list.length === 0 && <div className="combo-list empty">{noMatch}</div>}
    </div>
  );
}
