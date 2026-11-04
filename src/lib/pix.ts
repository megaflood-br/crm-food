function tlv(id: string, value: string) {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

export function crc16(payload: string) {
  let crc = 0xffff;
  for (let index = 0; index < payload.length; index += 1) {
    crc ^= payload.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      if (crc & 0x8000) crc = (crc << 1) ^ 0x1021;
      else crc <<= 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function pixText(value: string, max: number) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .toUpperCase()
    .slice(0, max);
}

export function pixPayload(input: { key: string; holder: string; city: string; amountCents?: number; txid?: string }) {
  const key = input.key.trim();
  if (!key) throw new Error("Chave Pix vazia");
  const merchant = tlv("00", "BR.GOV.BCB.PIX") + tlv("01", key);
  const amount = input.amountCents && input.amountCents > 0 ? (input.amountCents / 100).toFixed(2) : "";
  const txid = (input.txid || "***").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  let payload = tlv("00", "01") + tlv("26", merchant) + tlv("52", "0000") + tlv("53", "986");
  if (amount) payload += tlv("54", amount);
  payload += tlv("58", "BR") + tlv("59", pixText(input.holder || "LOJA", 25)) + tlv("60", pixText(input.city || "SAO PAULO", 15));
  payload += tlv("62", tlv("05", txid));
  payload += "6304";
  payload += crc16(payload);
  return payload;
}
