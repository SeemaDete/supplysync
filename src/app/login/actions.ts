"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export async function loginWithEmail(_prev: { error?: string } | undefined, formData: FormData) {
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/",
    });
    return {};
  } catch (e) {
    if (e instanceof AuthError) return { error: "Invalid email or password, or the account is inactive." };
    throw e; // NEXT_REDIRECT must propagate
  }
}

export async function loginWithMicrosoft() {
  await signIn("microsoft-entra-id", { redirectTo: "/" });
}
