"use client";

import { begriffe, type Begriffe } from "@/lib/begriffe";
import { useWer } from "@/lib/wer";

/**
 * Die Begriffe der angemeldeten Organisation (seit 26.10.19). Der Modus
 * kommt mit `/wer`, damit auch eine eingeschränkte Person ihn kennt; solange
 * er lädt, gilt der Vertrieb — die Vorgabe jeder Installation.
 */
export function useBegriffe(): Begriffe {
  const { wer } = useWer();
  return begriffe(wer.data?.modus);
}
