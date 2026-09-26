import { SettingsClient } from "./settings-client";
import { getOperations, getSelectedKomgaLibrary, getServices } from "@/lib/services/settings";
export default async function SettingsPage() { const [services, selectedLibrary, operations] = await Promise.all([getServices(), getSelectedKomgaLibrary(), getOperations()]); return <SettingsClient services={services} selectedLibrary={selectedLibrary} operations={operations} />; }
