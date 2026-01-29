import { redirect } from "next/navigation";

export default function ControlRoomImportPage() {
  // Mantiene el menú del Control Room, pero el importador real vive en /import
  redirect("/import");
}
