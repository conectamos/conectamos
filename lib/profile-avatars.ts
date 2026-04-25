export const TIPOS_PERFIL_VISUAL = [
  "ADMINISTRADOR",
  "FACTURADOR",
  "SUPERVISOR_TIENDA",
  "VENDEDOR",
] as const;

export type TipoPerfilVisual = (typeof TIPOS_PERFIL_VISUAL)[number];

export const AVATAR_PERFIL_KEYS = [
  "SUPERVISOR",
  "FACTURADOR",
  "VENDEDOR_HOMBRE",
  "VENDEDOR_MUJER",
  "ADMINISTRADOR_HOMBRE",
  "ADMINISTRADOR_MUJER",
] as const;

export type AvatarPerfilKey = (typeof AVATAR_PERFIL_KEYS)[number];

type AvatarOption = {
  value: AvatarPerfilKey;
  label: string;
};

const AVATAR_OPTIONS_BY_TIPO: Record<TipoPerfilVisual, AvatarOption[]> = {
  ADMINISTRADOR: [
    { value: "ADMINISTRADOR_HOMBRE", label: "Administrador hombre" },
    { value: "ADMINISTRADOR_MUJER", label: "Administrador mujer" },
  ],
  FACTURADOR: [{ value: "FACTURADOR", label: "Facturador" }],
  SUPERVISOR_TIENDA: [{ value: "SUPERVISOR", label: "Supervisor" }],
  VENDEDOR: [
    { value: "VENDEDOR_HOMBRE", label: "Vendedor hombre" },
    { value: "VENDEDOR_MUJER", label: "Vendedor mujer" },
  ],
};

export function obtenerOpcionesAvatarPorTipo(tipo: TipoPerfilVisual) {
  return AVATAR_OPTIONS_BY_TIPO[tipo];
}

export function obtenerAvatarDefaultPorTipo(tipo: TipoPerfilVisual): AvatarPerfilKey {
  return AVATAR_OPTIONS_BY_TIPO[tipo][0].value;
}

export function normalizarAvatarPerfil(
  valor: unknown,
  tipo: TipoPerfilVisual
): AvatarPerfilKey {
  const avatarKey = String(valor || "").trim().toUpperCase() as AvatarPerfilKey;
  const opciones = AVATAR_OPTIONS_BY_TIPO[tipo];

  return opciones.some((opcion) => opcion.value === avatarKey)
    ? avatarKey
    : obtenerAvatarDefaultPorTipo(tipo);
}

export function etiquetaAvatarPerfil(avatarKey: AvatarPerfilKey) {
  return (
    AVATAR_OPTIONS_BY_TIPO.ADMINISTRADOR.find((item) => item.value === avatarKey)?.label ||
    AVATAR_OPTIONS_BY_TIPO.FACTURADOR.find((item) => item.value === avatarKey)?.label ||
    AVATAR_OPTIONS_BY_TIPO.SUPERVISOR_TIENDA.find((item) => item.value === avatarKey)?.label ||
    AVATAR_OPTIONS_BY_TIPO.VENDEDOR.find((item) => item.value === avatarKey)?.label ||
    avatarKey
  );
}
