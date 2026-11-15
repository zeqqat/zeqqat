import { redirect } from "next/navigation";
import { REPLAYS } from "../../lib/demo-replays";

// /demo has no page of its own: it opens the first question.
export default function DemoIndex() {
  redirect(`/demo/${REPLAYS[0].slug}`);
}
