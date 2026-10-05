// The website is set in Archivo and relies on its heavier weights for the big uppercase headings.
// Loading the same family means the app and the site read as one brand rather than a rough copy,
// so the weights the CSS actually uses are the ones loaded here.

import {
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_800ExtraBold,
  Archivo_900Black,
  useFonts as useArchivoFonts
} from "@expo-google-fonts/archivo";

export const fontFamily = {
  regular: "Archivo_400Regular",
  medium: "Archivo_500Medium",
  semibold: "Archivo_600SemiBold",
  bold: "Archivo_700Bold",
  extrabold: "Archivo_800ExtraBold",
  black: "Archivo_900Black"
};

export function useBrandFonts() {
  return useArchivoFonts({
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_800ExtraBold,
    Archivo_900Black
  });
}