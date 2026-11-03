import { favouredBuyShare } from "../bands";
import { defineMeasure } from "../measure";

/** M12-4 (#252). One run's worst; the lab takes the mean over seeds. */
export default defineMeasure({
  id: "favouredBuyShare",
  label: "Favoured machine, latest first buy",
  unit: "share of band",
  why: "Each band's favoured machine should be bought early in the band where it shines.",
  aggregate: (samples) => favouredBuyShare(samples),
});
