import { useEffect, useState } from "react";
import { api } from "./api.js";

/** Whether this server can send email (password resets, invites). */
export function useEmailEnabled() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    void api<{ enabled: boolean }>("/api/email/enabled")
      .then((r) => setEnabled(r.enabled))
      .catch(() => setEnabled(false));
  }, []);
  return enabled;
}
