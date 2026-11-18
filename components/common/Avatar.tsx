"use client";

import Image from "next/image";
import { useState } from "react";
import { getAnimalAvatar, getInitials } from "@/features/games/gameService";
import type { Player } from "@/types/game";

type AvatarProps = { player: Player; small?: boolean };

export function Avatar({ player, small = false }: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <i
      className={small ? "avatar small" : "avatar"}
      style={{ background: player.color, borderColor: player.color }}
    >
      {imageFailed ? (
        getInitials(player.name)
      ) : (
        <Image
          src={getAnimalAvatar(player)}
          alt={`${player.name}'s animal avatar`}
          width={small ? 27 : 38}
          height={small ? 27 : 38}
          onError={() => setImageFailed(true)}
        />
      )}
    </i>
  );
}
