import { z } from "zod";

export const orderSchema = z.object({
  shippingAddress: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    address: z.string().min(5),
    city: z.string().min(2),
    postalCode: z.string().min(4),
    phone: z.string().min(10),
  }),
  paymentMethod: z.enum(["COD", "CARD", "GCASH"]),
});
