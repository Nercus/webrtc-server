import { DurableObject } from "cloudflare:workers";
import { v7 as uuidv7 } from 'uuid';

export class MyDurableObject extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}

	async sayHello(name: string): Promise<string> {
		return `Hello, ${name}!`;
	}
}


const generateRoomId = () => {
  // return first part of a v7 UUID
  return uuidv7().split('-')[0];
}

export default {
  async fetch(request, env): Promise<Response> {
    return new Response(JSON.stringify({ roomId: generateRoomId(), }));
	},
} satisfies ExportedHandler<Env>;
