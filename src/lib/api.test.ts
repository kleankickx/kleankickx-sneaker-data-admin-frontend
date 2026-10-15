import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, restoreSession } from "./api";
import { toast } from "./toast";

const user = {
  id: "u1",
  email: "op@kleankickx.com",
  name: "Operator",
  username: "op",
  role: "",
};

function httpError(status: number) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: { success: false, error: { code: "x" } } },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a request that gets no response", () => {
  /* Stands in for the network: each call returns the next outcome. */
  function network(...outcomes: ("drop" | "ok")[]) {
    const calls: unknown[] = [];
    const adapter = async (config: InternalAxiosRequestConfig) => {
      calls.push(config.data);
      if (outcomes[calls.length - 1] === "drop") {
        throw new AxiosError("Network Error", "ERR_NETWORK", config);
      }
      return { data: { ok: true }, status: 201, statusText: "Created", headers: {}, config };
    };
    return { adapter, calls };
  }

  it("is tried once more on a fresh connection, and the retry's answer is used", async () => {
    const toastError = vi.spyOn(toast, "error");
    const { adapter, calls } = network("drop", "ok");

    const res = await api.post("/pipeline-runs/", { sneaker_pair: "p1" }, { adapter });

    expect(res.status).toBe(201);
    expect(calls).toHaveLength(2);
    expect(JSON.parse(String(calls[1]))).toEqual({ sneaker_pair: "p1" });
    // It worked in the end: no "Can't reach the server"
    expect(toastError).not.toHaveBeenCalled();
  });

  it("gives up after the retry and says the server can't be reached", async () => {
    const toastError = vi.spyOn(toast, "error");
    const { adapter, calls } = network("drop", "drop", "ok");

    await expect(api.post("/pipeline-runs/", {}, { adapter })).rejects.toMatchObject({ code: "ERR_NETWORK" });
    expect(calls).toHaveLength(2);
    expect(toastError).toHaveBeenCalledWith(expect.any(String), { title: "Can't reach the server" });
  });
});

describe("restoreSession", () => {
  it("returns the user when the access cookie is still valid", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: { success: true, data: user } });
    const refresh = vi.spyOn(axios, "post");

    await expect(restoreSession()).resolves.toEqual(user);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes an expired access cookie and asks again", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockRejectedValueOnce(httpError(401))
      .mockResolvedValueOnce({ data: { success: true, data: user } });
    const refresh = vi
      .spyOn(axios, "post")
      .mockResolvedValue({ data: { success: true, data: null } });

    await expect(restoreSession()).resolves.toEqual(user);
    expect(refresh).toHaveBeenCalledWith(
      expect.stringContaining("/auth/token/refresh/"),
      {},
      expect.objectContaining({ withCredentials: true }),
    );
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("rejects when the refresh cookie is gone too", async () => {
    vi.spyOn(api, "get").mockRejectedValue(httpError(401));
    vi.spyOn(axios, "post").mockRejectedValue(httpError(401));

    await expect(restoreSession()).rejects.toMatchObject({
      response: { status: 401 },
    });
  });

  it("does not try to refresh on other errors", async () => {
    vi.spyOn(api, "get").mockRejectedValue(httpError(500));
    const refresh = vi.spyOn(axios, "post");

    await expect(restoreSession()).rejects.toMatchObject({
      response: { status: 500 },
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
