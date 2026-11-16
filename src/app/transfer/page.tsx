import { Frame } from "@/components/frame";
import { Transfer } from "./transfer";

/** 下载与上传: everything, or the texts, as JSON or XML; an upload checked and shown before it applies. */
export default function TransferPage() {
  return (
    <Frame>
      <Transfer />
    </Frame>
  );
}
