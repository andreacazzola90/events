declare module "next-auth" {
  interface User {
    id: string;
    email: string;
    name?: string | null;
    role?: string;
    type?: string;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      role?: string;
      type?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    email: string;
    name?: string | null;
    role?: string;
    type?: string;
  }
}
