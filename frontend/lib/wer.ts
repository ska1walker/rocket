"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { favoritUmschalten } from "@/lib/navigation";
import type { Wer } from "@/lib/typen";

/** Wer gerade handelt — immer die angemeldete Person selbst. */
export function useWer() {
  const wer = useQuery({
    queryKey: ["wer"],
    queryFn: () => api.get<Wer>("/api/mitglieder/wer"),
  });
  return { wer };
}

/**
 * Die Favoriten der handelnden Person — sofort sichtbar, dann gespeichert.
 *
 * Das Lesezeichen wirkt, bevor der Server geantwortet hat; scheitert das
 * Speichern, springt er zurück. Gespeichert wird am Menschen auf der Box,
 * nicht im Browser: Auf jedem Gerät dieselben Favoriten.
 */
export function useFavoriten() {
  const client = useQueryClient();
  const { wer } = useWer();
  const schluessel = ["wer"];
  const favoriten = wer.data?.einstellungen?.favoriten ?? [];

  const speichern = useMutation({
    mutationFn: (neu: string[]) => api.patch<Wer>("/api/mitglieder/wer/einstellungen", { favoriten: neu }),
    onMutate: async (neu) => {
      await client.cancelQueries({ queryKey: schluessel });
      const vorher = client.getQueryData<Wer>(schluessel);
      if (vorher) client.setQueryData<Wer>(schluessel, { ...vorher, einstellungen: { ...vorher.einstellungen, favoriten: neu } });
      return { vorher };
    },
    onError: (_fehler, _neu, kontext) => {
      if (kontext?.vorher) client.setQueryData(schluessel, kontext.vorher);
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["wer"] }),
  });

  return {
    favoriten,
    geladen: wer.isSuccess,
    // Vom Stand im Zwischenspeicher aus, nicht vom Stand beim Zeichnen: Zwei
    // schnelle Klicks sollen zwei Favoriten ergeben, nicht den zweiten allein.
    umschalten: (pfad: string) => {
      const aktuell = client.getQueryData<Wer>(schluessel)?.einstellungen?.favoriten ?? favoriten;
      speichern.mutate(favoritUmschalten(aktuell, pfad));
    },
  };
}
