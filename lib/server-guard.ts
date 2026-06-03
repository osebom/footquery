if (typeof window !== "undefined") {
  throw new Error(
    "This module is server-only and must not be imported from client components.",
  );
}
