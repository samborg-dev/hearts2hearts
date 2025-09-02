import { NextRequest, NextResponse } from "next/server";

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    // Handle error case
    return NextResponse.redirect(
      new URL(`/spotify-demo?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (code) {
    try {
      // Exchange authorization code for access token
      const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${Buffer.from(
            `${process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
          ).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code,
          redirect_uri: "http://127.0.0.1:3000/api/auth/callback/spotify",
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error("Failed to exchange code for token");
      }

      const tokenData = await tokenResponse.json() as SpotifyTokenResponse;
      
      // Redirect back to the demo page with the token in the URL hash
      return NextResponse.redirect(
        new URL(`/spotify-demo#access_token=${tokenData.access_token}&token_type=Bearer&expires_in=${tokenData.expires_in}`, request.url)
      );
    } catch (err) {
      console.error("Token exchange error:", err);
      return NextResponse.redirect(
        new URL(`/spotify-demo?error=token_exchange_failed`, request.url)
      );
    }
  }

  // If no code or error, redirect to demo page
  return NextResponse.redirect(new URL("/spotify-demo", request.url));
}
