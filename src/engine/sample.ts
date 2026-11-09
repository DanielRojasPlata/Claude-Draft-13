import { DocState } from "./doc";
import { ElementType } from "./types";

const rows: [ElementType, string][] = [
  ["Scene Heading", "INT. LIGHTHOUSE KITCHEN - NIGHT"],
  ["Action", "A storm hammers the shutters. IRIS VANCE, sixties, wind-burned hands, counts out two chipped mugs and fills only one. The radio on the sill hisses between stations."],
  ["Character", "IRIS"],
  ["Parenthetical", "(to the empty chair)"],
  ["Dialogue", "Forty winters and you still won't take the weather seriously. It's going to take the roof one of these years."],
  ["Action", "The lamp overhead sways. A knock at the door — three slow raps."],
  ["Character", "THEO (O.S.)"],
  ["Dialogue", "Mrs. Vance? It's the supply boat. Captain says we can't hold the mooring much longer."],
  ["Character", "IRIS"],
  ["Dialogue", "Then let it go. I told your captain in September, and I told him again at Christmas: nothing leaves this rock until the light is out for good. I have kept it burning through three governments, two fires and one very long marriage, and I do not intend to be argued off my own stairs by a boy with a clipboard."],
  ["Transition", "CUT TO:"],
  ["Scene Heading", "EXT. LIGHTHOUSE GALLERY - CONTINUOUS"],
  ["Action", "Spray slaps the railing. THEO BRANDT, nineteen, soaked through, shouts up from the base of the tower. Iris leans out over the rail, lamp-glow behind her."],
  ["Character", "THEO"],
  ["Dialogue", "There's a ship out there, Mrs. Vance. Not ours."],
  ["Character", "IRIS"],
  ["Parenthetical", "(beat)"],
  ["Dialogue", "Then we'd better be very good at our jobs."],
  ["Shot", "ANGLE ON - THE LENS"],
  ["Action", "The great Fresnel lens turns. Its beam sweeps the black water and finds, for one second, a hull far too close to the rocks."],
  ["Scene Heading", "INT. LIGHTHOUSE STAIRCASE - NIGHT"],
  ["Action", "Iris takes the steps two at a time, a woman half her age. Theo struggles behind her with a coil of rope."],
  ["Character", "THEO"],
  ["Dialogue", "How do you do that?"],
  ["Character", "IRIS (V.O.)"],
  ["Dialogue", "Practice, and spite."],
  ["Transition", "SMASH CUT TO:"],
  ["Scene Heading", "EXT. OPEN SEA - NIGHT"],
  ["Action", "A freighter lurches, turns hard to port. Its searchlight finds the tower and holds."],
];
export const SAMPLE: DocState = {
  elements: rows.map(([type, text], i) => ({ id: `s${i}`, type, runs: [{ text }] })),
  cursor: { id: "s1", offset: 0 },
};
