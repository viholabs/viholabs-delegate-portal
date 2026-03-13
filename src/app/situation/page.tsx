import { redirect } from "next/navigation";

export default function SituationPage() {
  redirect("/control-room/shell?tab=situation");
}