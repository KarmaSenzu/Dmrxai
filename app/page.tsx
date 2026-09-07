import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth-session";
import LandingClient from "@/components/LandingClient";

export default async function HomePage() {
  const { user } = await getServerSession();

  // Authed users skip the landing and go straight to chat
  if (user) {
    redirect("/chat");
  }

  // Unauth users see the marketing landing
  return <LandingClient />;
}
