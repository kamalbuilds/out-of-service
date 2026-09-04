import type { NextConfig } from "next";

const ORIGIN_TRIAL_TOKEN =
  "AsalTzjMuR8bZgu8t8O7vDJ0wA+3db23zadvqnnReCnN9xct7jjbwTw5EYk35pi7twl1chLJuEnPdAB6SCcsJQ0AAABfeyJvcmlnaW4iOiJodHRwczovL291dC1vZi1zZXJ2aWNlLXNlcGlhLnZlcmNlbC5hcHA6NDQzIiwiZmVhdHVyZSI6IldlYk1DUCIsImV4cGlyeSI6MTc5NDg3MzYwMH0=";

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: [{ key: "Origin-Trial", value: ORIGIN_TRIAL_TOKEN }] }];
  },
};

export default nextConfig;
