import { useEffect, useRef, useState } from "react";
import type { MatchState, Actor } from "../../shared/domain";
import { api, emit, socket, message } from "./api";
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  PhoneOff,
} from "lucide-react";
export function Video({
  match,
  actor,
  onClose,
}: {
  match: MatchState;
  actor: Actor;
  onClose: () => void;
}) {
  const peer = useRef<RTCPeerConnection | null>(null),
    stream = useRef<MediaStream>(new MediaStream()),
    remoteStream = useRef<MediaStream>(new MediaStream()),
    local = useRef<HTMLVideoElement>(null),
    remote = useRef<HTMLVideoElement>(null),
    generation = useRef(0),
    opening = useRef(new Set<string>()),
    candidates = useRef<RTCIceCandidateInit[]>([]);
  const [camera, setCamera] = useState(false),
    [ready, setReady] = useState(false),
    [mic, setMic] = useState(false),
    [hidden, setHidden] = useState(false),
    [muted, setMuted] = useState(false),
    [status, setStatus] = useState("Camera và micro đang tắt");
  useEffect(() => {
    let disposed = false;
    const client = socket;
    const signal = async (d: {
      matchId: string;
      sessionId: string;
      signal: {
        description?: RTCSessionDescriptionInit;
        candidate?: RTCIceCandidateInit;
      };
    }) => {
      if (d.matchId !== match.id || d.sessionId !== match.videoSessionId)
        return;
      if (!peer.current) {
        early.push(d);
        return;
      }
      try {
        const p = peer.current;
        if (d.signal.description) {
          const collision =
            d.signal.description.type === "offer" &&
            p.signalingState !== "stable";
          if (collision && actor.id === match.red) return;
          if (collision) await p.setLocalDescription({ type: "rollback" });
          await p.setRemoteDescription(d.signal.description);
          if (d.signal.description.type === "offer") {
            for (const transceiver of p.getTransceivers())
              transceiver.direction = "sendrecv";
            setReady(true);
          }
          for (const c of candidates.current) await p.addIceCandidate(c);
          candidates.current = [];
          if (d.signal.description.type === "offer") {
            await p.setLocalDescription(await p.createAnswer());
            await emit("video:signal", {
              matchId: match.id,
              sessionId: match.videoSessionId,
              signal: { description: p.localDescription },
            });
          }
        } else if (d.signal.candidate) {
          if (p.remoteDescription) await p.addIceCandidate(d.signal.candidate);
          else candidates.current.push(d.signal.candidate);
        }
      } catch (e) {
        setStatus(message(e));
      }
    };
    const early: Parameters<typeof signal>[0][] = [];
    client?.on("video:signal", signal);
    void api("/matches/" + match.id + "/rtc-config")
      .then((c) => {
        if (disposed) return;
        const p = new RTCPeerConnection({ iceServers: c.iceServers });
        peer.current = p;
        p.ontrack = (e) => {
          remoteStream.current.addTrack(e.track);
          if (remote.current) remote.current.srcObject = remoteStream.current;
        };
        p.onicecandidate = (e) => {
          if (e.candidate)
            void emit("video:signal", {
              matchId: match.id,
              sessionId: match.videoSessionId,
              signal: { candidate: e.candidate.toJSON() },
            }).catch(() => {});
        };
        p.onconnectionstatechange = () => {
          setStatus(
            p.connectionState === "connected"
              ? "Đã kết nối"
              : p.connectionState === "failed"
                ? "Không kết nối media. Ván cờ vẫn tiếp tục."
                : p.connectionState,
          );
          if (p.connectionState === "failed") {
            for (const t of stream.current.getTracks()) t.stop();
            setCamera(false);
            setMic(false);
          }
        };
        p.onnegotiationneeded = async () => {
          // Fixed audio/video transceivers use replaceTrack for device toggles.
          // Red alone offers; Black answers, avoiding simultaneous-offer glare.
          if (actor.id !== match.red) return;
          if (p.signalingState !== "stable") return;
          try {
            await p.setLocalDescription(await p.createOffer());
            await emit("video:signal", {
              matchId: match.id,
              sessionId: match.videoSessionId,
              signal: { description: p.localDescription },
            });
          } catch (e) {
            setStatus(message(e));
          }
        };
        if (actor.id === match.red) {
          p.addTransceiver("video", { direction: "sendrecv" });
          p.addTransceiver("audio", { direction: "sendrecv" });
          setReady(true);
        }
        for (const d of early) void signal(d);
      })
      .catch((e) => setStatus(message(e)));
    const quality = setInterval(() => {
      const p = peer.current;
      if (!p || p.connectionState !== "connected") return;
      void p
        .getStats()
        .then(async (stats) => {
          let available: number | undefined;
          stats.forEach((report) => {
            if (
              report.type === "candidate-pair" &&
              report.state === "succeeded" &&
              report.nominated
            )
              available = report.availableOutgoingBitrate;
          });
          if (available !== undefined && available < 150000) {
            const sender = p
              .getSenders()
              .find((s) => s.track?.kind === "video");
            if (!sender?.track) return;
            if (available < 60000) {
              sender.track.enabled = false;
              setCamera(false);
              setStatus(
                "Mạng yếu: đã tắt video, giữ âm thanh nếu kết nối cho phép.",
              );
            } else {
              await sender.track.applyConstraints({
                width: { max: 160 },
                height: { max: 120 },
                frameRate: { max: 8 },
              });
              const params = sender.getParameters();
              params.encodings = params.encodings.map((e) => ({
                ...e,
                maxBitrate: 100000,
              }));
              await sender.setParameters(params);
              setStatus("Mạng yếu: đã giảm chất lượng video.");
            }
          }
        })
        .catch(() => {});
    }, 3000);
    const stop = () => {
      generation.current++;
      for (const t of stream.current.getTracks()) t.stop();
      peer.current?.close();
      peer.current = null;
      setCamera(false);
      setMic(false);
      setReady(false);
      setStatus("Mất kết nối signaling. Thiết bị đã tắt.");
    };
    client?.on("disconnect", stop);
    return () => {
      generation.current++;
      client?.off("disconnect", stop);
      clearInterval(quality);
      disposed = true;
      client?.off("video:signal", signal);
      for (const t of stream.current.getTracks()) t.stop();
      stream.current = new MediaStream();
      remoteStream.current = new MediaStream();
      peer.current?.close();
      peer.current = null;
    };
  }, [match.id, match.red, actor.id, match.videoSessionId]);
  async function toggle(kind: "video" | "audio") {
    if (opening.current.has(kind)) return;
    const currentPeer = peer.current;
    if (!currentPeer || currentPeer.connectionState === "closed") {
      setStatus("Kết nối media chưa sẵn sàng. Ván cờ vẫn tiếp tục.");
      return;
    }
    const currentGeneration = generation.current;
    opening.current.add(kind);
    try {
      const existing = stream.current.getTracks().find((t) => t.kind === kind);
      if (existing && existing.readyState === "live") {
        existing.enabled = !existing.enabled;
        kind === "video"
          ? setCamera(existing.enabled)
          : setMic(existing.enabled);
        return;
      }
      const media = await navigator.mediaDevices.getUserMedia(
        kind === "video"
          ? {
              video: {
                width: { ideal: 320, max: 640 },
                height: { ideal: 240, max: 480 },
                frameRate: { max: 15 },
              },
              audio: false,
            }
          : { audio: true, video: false },
      );
      if (
        generation.current !== currentGeneration ||
        peer.current !== currentPeer
      ) {
        for (const track of media.getTracks()) track.stop();
        return;
      }
      if (existing) stream.current.removeTrack(existing);
      for (const track of media.getTracks()) {
        stream.current.addTrack(track);
        const transceiver = peer.current
          ?.getTransceivers()
          .find((t) => t.receiver.track.kind === kind);
        await transceiver?.sender.replaceTrack(track);
        if (kind === "video") {
          await transceiver?.sender.setParameters({
            ...transceiver.sender.getParameters(),
            encodings: [{ maxBitrate: 250000 }],
          });
        }
      }
      if (local.current) local.current.srcObject = stream.current;
      kind === "video" ? setCamera(true) : setMic(true);
    } catch (e) {
      setStatus("Không mở được thiết bị: " + message(e));
    } finally {
      opening.current.delete(kind);
    }
  }
  return (
    <section className="video video-pip" aria-label="Cuộc gọi video">
      <div className="video-grid">
        <video
          className="video-local"
          ref={local}
          muted
          autoPlay
          playsInline
          aria-label="Video của bạn"
        />
        <video
          className="video-remote"
          ref={remote}
          autoPlay
          playsInline
          muted={muted}
          style={{ visibility: hidden ? "hidden" : "visible" }}
          aria-label="Video đối phương"
        />
      </div>
      <p role="status" className="video-status">
        {status}
      </p>
      <div className="actions">
        <button
          aria-pressed={camera}
          disabled={!ready}
          onClick={() => void toggle("video")}
        >
          {camera ? (
            <Camera aria-hidden="true" size={20} />
          ) : (
            <CameraOff aria-hidden="true" size={20} />
          )}
          {camera ? "Tắt" : "Bật"} camera
        </button>
        <button
          aria-pressed={mic}
          disabled={!ready}
          onClick={() => void toggle("audio")}
        >
          {mic ? (
            <Mic aria-hidden="true" size={20} />
          ) : (
            <MicOff aria-hidden="true" size={20} />
          )}
          {mic ? "Tắt" : "Bật"} micro
        </button>
        <button aria-pressed={hidden} onClick={() => setHidden(!hidden)}>
          {hidden ? (
            <EyeOff aria-hidden="true" size={20} />
          ) : (
            <Eye aria-hidden="true" size={20} />
          )}
          {hidden ? "Hiện" : "Ẩn"} đối phương
        </button>
        <button aria-pressed={muted} onClick={() => setMuted(!muted)}>
          {muted ? (
            <VolumeX aria-hidden="true" size={20} />
          ) : (
            <Volume2 aria-hidden="true" size={20} />
          )}
          {muted ? "Mở" : "Tắt"} âm đối phương
        </button>
        <button className="danger" onClick={onClose}>
          <PhoneOff aria-hidden="true" size={20} />
          Kết thúc gọi
        </button>
      </div>
    </section>
  );
}
