import { AppFrame } from "../../components/AppFrame";

// Your own profile, the same whichever account you're looking at.
export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <AppFrame level="profile">{children}</AppFrame>;
}
