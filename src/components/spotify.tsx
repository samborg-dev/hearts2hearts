"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// Spotify API Types
interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  artists: Array<{ name: string }>;
  album: {
    name: string;
    images: Array<{ url: string; height: number; width: number }>;
  };
  duration_ms: number;
  preview_url: string | null;
  external_urls: { spotify: string };
}

interface SpotifyPlaylist {
  id: string;
  name: string;
  uri: string;
  description: string;
  images: Array<{ url: string }>;
  tracks: {
    total: number;
  };
  external_urls: { spotify: string };
}

interface SpotifyUser {
  id: string;
  display_name: string;
  email: string;
  images: Array<{ url: string }>;
  followers: { total: number };
}

interface SpotifySearchResults {
  tracks: {
    items: SpotifyTrack[];
  };
  playlists: {
    items: SpotifyPlaylist[];
  };
}

// Web Playback SDK Types
interface SpotifyPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  getCurrentState(): Promise<SpotifyPlaybackState | null>;
  setName(name: string): Promise<void>;
  getVolume(): Promise<number>;
  setVolume(volume: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  togglePlay(): Promise<void>;
  seek(position_ms: number): Promise<void>;
  previousTrack(): Promise<void>;
  nextTrack(): Promise<void>;
  addListener(event: string, callback: (state: unknown) => void): boolean;
  removeListener(event: string, callback?: (state: unknown) => void): boolean;
}

interface SpotifyPlaybackState {
  context: {
    uri: string;
    metadata: Record<string, unknown>;
  };
  disallows: {
    pausing: boolean;
    peeking_next: boolean;
    peeking_prev: boolean;
    resuming: boolean;
    seeking: boolean;
    skipping_next: boolean;
    skipping_prev: boolean;
  };
  paused: boolean;
  position: number;
  repeat_mode: number;
  shuffle: boolean;
  track_window: {
    current_track: SpotifyTrack;
    previous_tracks: SpotifyTrack[];
    next_tracks: SpotifyTrack[];
  };
}

declare global {
  interface Window {
    Spotify: {
      Player: new (options: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume: number;
      }) => SpotifyPlayer;
    };
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

export default function SpotifyComponent() {
  // State management
  const [accessToken, setAccessToken] = useState<string>("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<SpotifyUser | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SpotifySearchResults | null>(null);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [player, setPlayer] = useState<SpotifyPlayer | null>(null);
  const [, setPlaybackState] = useState<SpotifyPlaybackState | null>(null);
  const [deviceId, setDeviceId] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<SpotifyTrack | null>(null);
  const [volume, setVolume] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const playerRef = useRef<SpotifyPlayer | null>(null);

  // Spotify Web API Base URL
  const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

  // Initialize Spotify Web Playback SDK
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    document.body.appendChild(script);

    window.onSpotifyWebPlaybackSDKReady = () => {
      console.log("Spotify Web Playback SDK Ready!");
    };

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  // Spotify Authentication
  const authenticateSpotify = async () => {
    const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
    const redirectUri = "http://127.0.0.1:3000/api/auth/callback/spotify";
    const scopes = [
      "user-read-private",
      "user-read-email",
      "user-top-read",
      "playlist-read-private",
      "playlist-read-collaborative",
      "user-read-playback-state",
      "user-modify-playback-state",
      "user-read-currently-playing",
      "streaming",
      "user-library-read",
      "user-library-modify"
    ].join(" ");

    // Use Authorization Code flow instead of Implicit Grant
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&show_dialog=true`;
    
    window.location.href = authUrl;
  };

  // Extract access token from URL hash
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const token = params.get("access_token");
      if (token) {
        setAccessToken(token);
        setIsAuthenticated(true);
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  // Initialize Web Playback SDK Player
  const initializePlayer = useCallback(() => {
    if (!accessToken || !window.Spotify) return;

    const spotifyPlayer = new window.Spotify.Player({
      name: "Hearts2Hearts Player",
      getOAuthToken: (cb) => {
        cb(accessToken);
      },
      volume: volume / 100,
    });

    // Error handling
    spotifyPlayer.addListener("initialization_error", (state: unknown) => {
      const error = state as { message: string };
      setError(`Initialization Error: ${error.message}`);
    });

    spotifyPlayer.addListener("authentication_error", (state: unknown) => {
      const error = state as { message: string };
      setError(`Authentication Error: ${error.message}`);
    });

    spotifyPlayer.addListener("account_error", (state: unknown) => {
      const error = state as { message: string };
      setError(`Account Error: ${error.message}`);
    });

    spotifyPlayer.addListener("playback_error", (state: unknown) => {
      const error = state as { message: string };
      setError(`Playback Error: ${error.message}`);
    });

    // Playback status updates
    spotifyPlayer.addListener("player_state_changed", (state: unknown) => {
      if (!state || typeof state !== 'object') return;
      
      const playbackState = state as SpotifyPlaybackState;
      setPlaybackState(playbackState);
      setIsPlaying(!playbackState.paused);
      setCurrentTrack(playbackState.track_window.current_track);
    });

    // Ready
    spotifyPlayer.addListener("ready", (state: unknown) => {
      const readyState = state as { device_id: string };
      console.log("Ready with Device ID", readyState.device_id);
      setDeviceId(readyState.device_id);
      setPlayer(spotifyPlayer);
      playerRef.current = spotifyPlayer;
    });

    // Not Ready
    spotifyPlayer.addListener("not_ready", (state: unknown) => {
      const notReadyState = state as { device_id: string };
      console.log("Device ID has gone offline", notReadyState.device_id);
    });

    // Connect to the player
    void spotifyPlayer.connect();
  }, [accessToken, volume]);

  // Initialize player when authenticated
  useEffect(() => {
    if (isAuthenticated && window.Spotify) {
      initializePlayer();
    }
  }, [isAuthenticated, accessToken, initializePlayer]);

  // Fetch user profile
  const fetchUserProfile = useCallback(async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      const response = await fetch(`${SPOTIFY_API_BASE}/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) throw new Error("Failed to fetch user profile");

      const userData = await response.json() as SpotifyUser;
      setUser(userData);
    } catch (err) {
      setError(`Error fetching user profile: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  // Search for tracks and playlists
  const searchSpotify = async () => {
    if (!accessToken || !searchQuery.trim()) return;

    try {
      setLoading(true);
      const response = await fetch(
        `${SPOTIFY_API_BASE}/search?q=${encodeURIComponent(searchQuery)}&type=track,playlist&limit=10`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) throw new Error("Search failed");

      const data = await response.json() as SpotifySearchResults;
      setSearchResults(data);
    } catch (err) {
      setError(`Search error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  // Fetch user's playlists
  const fetchPlaylists = useCallback(async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      const response = await fetch(`${SPOTIFY_API_BASE}/me/playlists`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) throw new Error("Failed to fetch playlists");

      const data = await response.json() as { items: SpotifyPlaylist[] };
      setPlaylists(data.items);
    } catch (err) {
      setError(`Error fetching playlists: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  // Play a track
  const playTrack = async (trackUri: string) => {
    if (!accessToken || !deviceId) return;

    try {
      const response = await fetch(`${SPOTIFY_API_BASE}/me/player/play?device_id=${deviceId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uris: [trackUri],
        }),
      });

      if (!response.ok) throw new Error("Failed to play track");
    } catch (err) {
      setError(`Play error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Play a playlist
  const playPlaylist = async (playlistUri: string) => {
    if (!accessToken || !deviceId) return;

    try {
      const response = await fetch(`${SPOTIFY_API_BASE}/me/player/play?device_id=${deviceId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          context_uri: playlistUri,
        }),
      });

      if (!response.ok) throw new Error("Failed to play playlist");
    } catch (err) {
      setError(`Play error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Player controls
  const togglePlayPause = () => {
    if (playerRef.current) {
      void playerRef.current.togglePlay();
    }
  };

  const nextTrack = () => {
    if (playerRef.current) {
      void playerRef.current.nextTrack();
    }
  };

  const previousTrack = () => {
    if (playerRef.current) {
      void playerRef.current.previousTrack();
    }
  };

  const setPlayerVolume = (newVolume: number) => {
    setVolume(newVolume);
    if (playerRef.current) {
      void playerRef.current.setVolume(newVolume / 100);
    }
  };

  // Format duration
  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  // Load user data when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      void fetchUserProfile();
      void fetchPlaylists();
    }
  }, [isAuthenticated, fetchUserProfile, fetchPlaylists]);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-green-600 mb-4">Spotify Integration Demo</h1>
        <p className="text-gray-600 mb-6">
          This component demonstrates Spotify Web API and Web Playback SDK functionality
        </p>
      </div>

      {/* Authentication Section */}
      {!isAuthenticated ? (
        <div className="text-center">
          <button
            onClick={authenticateSpotify}
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-full transition-colors"
          >
            Connect to Spotify
          </button>
                  <p className="text-sm text-gray-500 mt-2">
          You&apos;ll need to set NEXT_PUBLIC_SPOTIFY_CLIENT_ID in your environment variables
        </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* User Profile */}
          {user && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-bold mb-4">User Profile</h2>
              <div className="flex items-center space-x-4">
                {user.images[0] && (
                  <img
                    src={user.images[0].url}
                    alt="Profile"
                    className="w-16 h-16 rounded-full"
                  />
                )}
                <div>
                  <h3 className="text-xl font-semibold">{user.display_name}</h3>
                  <p className="text-gray-600">{user.email}</p>
                  <p className="text-sm text-gray-500">{user.followers.total} followers</p>
                </div>
              </div>
            </div>
          )}

          {/* Player Controls */}
          {player && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-bold mb-4">Player Controls</h2>
              <div className="space-y-4">
                {currentTrack && (
                  <div className="flex items-center space-x-4">
                    {currentTrack.album.images[0] && (
                      <img
                        src={currentTrack.album.images[0].url}
                        alt="Album"
                        className="w-12 h-12 rounded"
                      />
                    )}
                    <div className="flex-1">
                      <p className="font-semibold">{currentTrack.name}</p>
                      <p className="text-sm text-gray-600">
                        {currentTrack.artists.map(artist => artist.name).join(", ")}
                      </p>
                    </div>
                  </div>
                )}
                
                <div className="flex items-center justify-center space-x-4">
                  <button
                    onClick={previousTrack}
                    className="bg-gray-200 hover:bg-gray-300 p-2 rounded-full"
                  >
                    ⏮️
                  </button>
                  <button
                    onClick={togglePlayPause}
                    className="bg-green-600 hover:bg-green-700 text-white p-3 rounded-full"
                  >
                    {isPlaying ? "⏸️" : "▶️"}
                  </button>
                  <button
                    onClick={nextTrack}
                    className="bg-gray-200 hover:bg-gray-300 p-2 rounded-full"
                  >
                    ⏭️
                  </button>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-sm">Volume:</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={(e) => setPlayerVolume(parseInt(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-sm w-12">{volume}%</span>
                </div>
              </div>
            </div>
          )}

          {/* Search Section */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold mb-4">Search Spotify</h2>
            <div className="flex space-x-2 mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for tracks and playlists..."
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2"
                onKeyPress={(e) => e.key === "Enter" && searchSpotify()}
              />
              <button
                onClick={searchSpotify}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {loading ? "Searching..." : "Search"}
              </button>
            </div>

            {/* Search Results */}
            {searchResults && (
              <div className="space-y-4">
                {/* Tracks */}
                {searchResults.tracks.items.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Tracks</h3>
                    <div className="space-y-2">
                      {searchResults.tracks.items.map((track) => (
                        <div
                          key={track.id}
                          className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                        >
                          <div className="flex items-center space-x-3">
                            {track.album.images[0] && (
                              <img
                                src={track.album.images[0].url}
                                alt="Album"
                                className="w-10 h-10 rounded"
                              />
                            )}
                            <div>
                              <p className="font-medium">{track.name}</p>
                              <p className="text-sm text-gray-600">
                                {track.artists.map(artist => artist.name).join(", ")} • {track.album.name}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-gray-500">
                              {formatDuration(track.duration_ms)}
                            </span>
                            <button
                              onClick={() => playTrack(track.uri)}
                              className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm"
                            >
                              Play
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Playlists */}
                {searchResults.playlists.items.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Playlists</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {searchResults.playlists.items.map((playlist) => (
                        <div
                          key={playlist.id}
                          className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                        >
                          {playlist.images[0] && (
                            <img
                              src={playlist.images[0].url}
                              alt="Playlist"
                              className="w-12 h-12 rounded"
                            />
                          )}
                          <div className="flex-1">
                            <p className="font-medium">{playlist.name}</p>
                            <p className="text-sm text-gray-600">
                              {playlist.tracks.total} tracks
                            </p>
                          </div>
                          <button
                            onClick={() => playPlaylist(playlist.uri)}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm"
                          >
                            Play
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* User Playlists */}
          {playlists.length > 0 && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-bold mb-4">Your Playlists</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {playlists.map((playlist) => (
                  <div
                    key={playlist.id}
                    className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    {playlist.images[0] && (
                      <img
                        src={playlist.images[0].url}
                        alt="Playlist"
                        className="w-full h-32 object-cover rounded mb-3"
                      />
                    )}
                    <h3 className="font-semibold mb-1">{playlist.name}</h3>
                    <p className="text-sm text-gray-600 mb-2">
                      {playlist.tracks.total} tracks
                    </p>
                    <button
                      onClick={() => playPlaylist(playlist.uri)}
                      className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded text-sm"
                    >
                      Play Playlist
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
