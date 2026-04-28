import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/api/caja/cierre-dia": ["./public/pdf-fonts/Geist-Regular.ttf"],
  },
};

export default nextConfig;
