/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import axios from "axios"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function addExtraDots(input: string, maxLength: number, start: boolean = true): string {
  const isInputTooLong = input.length > maxLength
  if (!isInputTooLong) {
    return input
  }
  if (start) {
    return input.substring(0, maxLength - 3) + "..."
  } else {
    return "..." + input.substring(input.length - maxLength + 3);
  }
}

const greekWords = [
  "zeus", "hera", "poseidon", "demeter", "athena", "apollo", "artemis",
  "ares", "aphrodite", "hephaestus", "hermes", "dionysus", "hades",
  "persephone", "hecate", "nemesis", "nike", "iris", "eileithyia", "eris",
  "morpheus", "hypnos", "thanatos", "charon", "triton", "pan", "eros",
  "gaia", "uranus", "chronos", "rhea", "atlas", "prometheus", "epimetheus",
  "oceanus", "tethys", "helios", "selene", "eos", "nyx", "erebus", "aether"
];

const babyAnimals = [
  "puppy", "kitten", "cub", "chick", "duckling", "gosling", "fawn",
  "calf", "foal", "lamb", "kid", "piglet", "hatchling", "pup", "joey",
  "tadpole", "eaglet", "owlet", "nestling", "fledgling", "kit", "whelp"
];

export const generateRandomName = (): string => {
  const randomGreek = greekWords[Math.floor(Math.random() * greekWords.length)];
  const randomAnimal = babyAnimals[Math.floor(Math.random() * babyAnimals.length)];
  return `${randomGreek}_${randomAnimal}`;
};

export const generateRandomString = (length: number = 32): string => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters[randomIndex];
  }
  return result;
};

export function isWithinOneDay(timestamp1: number, timestamp2: number): boolean {
  const oneDayInMilliseconds = 24 * 60 * 60 * 1000; // 1 day in ms
  const difference = Math.abs(timestamp1 - timestamp2); // Absolute difference
  return difference <= oneDayInMilliseconds;
}

export async function GetLastVersion(): Promise<string> {
  const res = await axios.get(
    "https://api.github.com/repos/Dinamicas-Electronicas/expanse/releases/latest",
  );
  const data = res.data
  return data?.tag_name
}

// Runtime cache - stored in memory, created at runtime, not build time
let cachedVersion: { version: string | undefined; timestamp: number } | null = null
const CACHE_DURATION = 6 * 60 * 60 * 1000 // 6 hours in milliseconds

export const getCachedLastVersion = async (): Promise<string | undefined> => {
  const now = Date.now()

  // Return cached version if it exists and hasn't expired
  if (cachedVersion && (now - cachedVersion.timestamp) < CACHE_DURATION) {
    return cachedVersion.version
  }

  try {
    // Atom feed needs no auth and is not subject to API rate limits.
    const res = await axios.get(
      "https://github.com/Dinamicas-Electronicas/expanse/releases.atom",
    );
    const match = /<entry>[\s\S]*?<title>(.*?)<\/title>/.exec(res.data);
    const title = (match?.[1]?.trim() || "").replace(/<[^>]+>/g, "");
    const version = title.startsWith("v") ? title.slice(1) : title;
    if (!version) return undefined;

    // Update cache with new version and current timestamp
    cachedVersion = { version, timestamp: now }

    return version
  } catch (error) {
    console.error("Failed to fetch latest version:", error)
    return undefined
  }
}

/**
 * Resolves a logo path to ensure it loads correctly from the public directory.
 * With the new automated system, we use a dynamic API route to handle
 * extension fallback (svg vs png) independently of build-time manifests.
 */
export const resolveLogoPath = (path: string | undefined | null): string | null => {
  if (!path) return null;

  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  const inputFilename = cleanPath.split('/').pop() || cleanPath;
  const baseName = inputFilename.replace(/\.[^/.]+$/, "");

  const normalized = baseName
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-|-$/g, '');

  return `/api/logos/library/${normalized}`;
};

