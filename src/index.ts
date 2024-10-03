import { env } from "bun";
import { Hono } from "hono";
import moment = require("moment");
import * as cron from "node-cron";
import { z } from "zod";
const app = new Hono();

const methodSchema = z.enum(["POST", "GET", "DELETE", "PUT"]);
type Method = z.infer<typeof methodSchema>;

const serviceContextSchema = z.object({
    id: z.string(),
    url: z.string(),
    payload: z.object({}).passthrough(),
    method: methodSchema,
    interval: z.number(),
    recurring: z.boolean().optional(),
});

type ServiceContext = z.infer<typeof serviceContextSchema>;

interface ServiceMethods {
    start?: () => void;
    stop?: () => void;
}

type Service = ServiceContext & ServiceMethods;

const services = new Map<Service["id"], Service>();

const debug = (message: string) => {
    console.log(`CONGEST: ${message}`);
};

const invoke = async (id: Service["id"]) => {
    const service = services.get(id);
    if (!service) {
        debug(`Service with id ${id} has no context`);
        return;
    }
    console.log(`running ${id}`);
    return await fetch(service.url, {
        method: service.method,
        body: JSON.stringify(service.payload),
    });
};

const generateCronAt = (ms: number) => {
    const mo = moment().add(ms, "milliseconds");
    return mo.format("s m H D M") + " * " + mo.format("YYYY");
};

const generateCronAtEvery = (interval: number) => {
    const seconds = interval / 1000;
    return `*/${seconds} * * * * *`;
};

const registerService = (service: Service) => {
    if (services.has(service.id)) {
        debug(`Service with id ${service.id} already exists`);
        return;
    }

    const cronExpression = service.recurring
        ? generateCronAtEvery(service.interval)
        : generateCronAt(service.interval);

    const scheduleResult = cron.schedule(cronExpression, async () =>
        invoke(service.id)
    );

    const newService = {
        ...service,
        start: () => scheduleResult.start(),
        stop: () => scheduleResult.stop(),
    };

    services.set(service.id, newService);
    return newService;
};

const deregisterService = (id: Service["id"]) => {
    const service = services.get(id);
    if (!service) {
        debug(`Service with id ${id} not found for deregistration`);
        return;
    }

    service.stop?.();
    services.delete(id); // Remove the service from the registry
};

const stopAll = () => {
    services.forEach((service, id) => {
        service.stop?.();
    });
};

const allServices = () => {
    const result: Service[] = [];
    services.forEach((service, id) => result.push(service));
    return result;
};

app.get("/", (c) => {
    return c.text("Hello Hono!");
});

app.get("/status", (c) => {
    return c.json(allServices());
});

app.post("/register", async (c) => {
    const body = await c.req.json();
    const parsed = serviceContextSchema.safeParse(body);

    if (!parsed.success) {
        return c.json(parsed.error.message, 400);
    }

    const newService = parsed.data;

    const result = registerService(newService);

    if (!result) return c.json("Service already exists", 400);

    return c.json(
        {
            success: true,
            message: `Service with ID: ${newService.id} has been registered.`,
        },
        200
    );
});

app.delete("/deregister", async (c) => {
    const body = await c.req.json();
    const parsed = z
        .object({
            id: serviceContextSchema.shape.id,
        })
        .safeParse(body);

    if (!parsed.success) {
        return c.json(parsed.error.message, 400);
    }

    const { id } = parsed.data;

    deregisterService(id);

    return c.json(
        {
            success: true,
            message: `Service with ID: ${id} has been de-registered.`,
        },
        200
    );
});

app.post("/stop-all", (c) => {
    stopAll();
    return c.json("stopped all", 200);
});

export default {
    port: env.PORT!,
    fetch: app.fetch,
};
