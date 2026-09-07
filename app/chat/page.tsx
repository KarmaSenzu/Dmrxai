import { redirect } from "next/navigation";
import { getServerSession, getUserProfile } from "@/lib/auth-session";
import HomeClient from "@/components/HomeClient";

export default async function ChatPage() {
  const { user } = await getServerSession();

  // Defense in depth — middleware already redirects unauth, but if env is
  // missing or middleware was bypassed, fall back to the login flow here.
  if (!user) {
    redirect("/login");
  }

  const profile = await getUserProfile(user.id);

  return (
    <HomeClient
      initialUser={
        profile
          ? {
              id: profile.id,
              email: profile.email,
              display_name: profile.display_name,
            }
          : {
              id: user.id,
              email: user.email ?? "",
              display_name: null,
            }
      }
    />
  );
}
