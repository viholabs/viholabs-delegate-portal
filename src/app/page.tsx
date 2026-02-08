import { redirect } from "next/navigation";

export default function HomePage() {
  // Ruta arrel NO valida actor.
  // Segons la Bíblia, la validació d’actor només passa
  // després de tenir sessió (auth/callback).
  redirect("/login");
}
