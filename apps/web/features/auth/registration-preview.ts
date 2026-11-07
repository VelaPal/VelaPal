import { z } from "zod";

// Frontend-only account flow. It never calls or invents a registration API.
export const registrationSchema = z
  .object({
    party: z.enum(["CUSTOMER", "SELLER"]),
    name: z.string().trim().min(2, "Enter your full name.").max(100),
    email: z.email("Enter a valid email address.").max(254),
    password: z.string().min(15, "Use at least 15 characters.").max(128),
    confirmPassword: z.string(),
    terms: z.boolean().refine((v) => v, "Review and accept the demo terms."),
    businessName: z.string().trim().max(100),
    businessCategory: z.enum(["Digital content", "Physical goods", "Services"]),
    country: z.enum(["Indonesia", "Singapore", "United States"]),
    website: z.union([z.literal(""), z.url("Enter a valid website URL.")]),
  })
  .superRefine((v, ctx) => {
    if (v.password !== v.confirmPassword)
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    if (v.party === "SELLER" && v.businessName.length < 2)
      ctx.addIssue({
        code: "custom",
        path: ["businessName"],
        message: "Enter your business name.",
      });
  });
export type RegistrationInput = z.infer<typeof registrationSchema>;
export type RegistrationPreview = {
  previewId: string;
  party: "CUSTOMER" | "SELLER";
  name: string;
  email: string;
  businessName: string;
  verified: boolean;
};
const key = "velapal:registration-preview";
export function createRegistrationPreview(
  input: RegistrationInput,
): RegistrationPreview {
  const parsed = registrationSchema.parse(input);
  const preview: RegistrationPreview = {
    previewId: crypto.randomUUID(),
    party: parsed.party,
    name: parsed.name,
    email: parsed.email,
    businessName: parsed.party === "SELLER" ? parsed.businessName : "",
    verified: false,
  };
  sessionStorage.setItem(key, JSON.stringify(preview));
  return preview; // Passwords and confirmation are deliberately discarded.
}
export async function readRegistrationPreview(): Promise<RegistrationPreview | null> {
  try {
    const data = JSON.parse(sessionStorage.getItem(key) || "null");
    if (
      !data ||
      !["CUSTOMER", "SELLER"].includes(data.party) ||
      typeof data.email !== "string" ||
      typeof data.name !== "string"
    )
      return null;
    return data;
  } catch {
    return null;
  }
}
export function verifyRegistrationPreview(
  preview: RegistrationPreview,
): RegistrationPreview {
  const next = { ...preview, verified: true };
  sessionStorage.setItem(key, JSON.stringify(next));
  return next;
}
